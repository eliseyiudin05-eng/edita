package campaigns

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Get(ctx context.Context, _ string, subject string) (View, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return View{}, ErrUnavailable
	}
	var role string
	if err := r.db.QueryRow(ctx, `select role from public.profiles where id=$1`, subject).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	} else if err != nil {
		return View{}, ErrUnavailable
	}
	result := View{Mode: role, Campaigns: []Campaign{}, League: []LeagueRow{}}
	if role != "business" {
		result.Mode = "editor"
	}
	if role == "business" {
		var business Business
		if err := r.db.QueryRow(ctx, `select id::text,name,verified,verification_level from public.businesses where owner_id=$1`, subject).Scan(&business.ID, &business.Name, &business.Verified, &business.VerificationLevel); errors.Is(err, pgx.ErrNoRows) {
			result.Business = nil
		} else if err != nil {
			return View{}, ErrUnavailable
		} else {
			result.Business = &business
			campaigns, err := r.businessCampaigns(ctx, business.ID)
			if err != nil {
				return View{}, err
			}
			result.Campaigns = campaigns
		}
	} else {
		campaigns, err := r.editorCampaigns(ctx, subject)
		if err != nil {
			return View{}, err
		}
		result.Campaigns = campaigns
	}
	league, err := r.league(ctx)
	if err != nil {
		return View{}, err
	}
	result.League = league
	return result, nil
}

func (r *PostgresRepository) league(ctx context.Context) ([]LeagueRow, error) {
	rows, err := r.db.Query(ctx, `with stats as (
		select b.id,b.name,b.verification_level,
		  (select count(*) from public.business_campaigns c where c.business_id=b.id and c.status='open') campaigns,
		  (select count(*) from public.business_campaign_applications a join public.business_campaigns c on c.id=a.campaign_id where c.business_id=b.id) applications,
		  (select count(*) from public.challenges c where c.business_id=b.id) challenges,
		  (select count(*) from public.jobs j where j.business_id=b.id) jobs
		from public.businesses b where b.verified
	)
	select id::text,name,verification_level,campaigns,applications,challenges,jobs,
	       campaigns*15+applications*2+challenges*10+jobs*5 score
	from stats order by score desc,id limit 20`)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []LeagueRow{}
	for rows.Next() {
		var item LeagueRow
		var challenges, jobs int64
		if rows.Scan(&item.ID, &item.Name, &item.Level, &item.Campaigns, &item.Applications, &challenges, &jobs, &item.Score) != nil {
			return nil, ErrUnavailable
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func scanCampaign(rows pgx.Rows) (Campaign, string, error) {
	var c Campaign
	var businessID string
	var created time.Time
	var nullableEnds *time.Time
	err := rows.Scan(&c.ID, &businessID, &c.Title, &c.Goal, &c.Requirements, &c.BudgetText, &c.CreatorSlots, &c.ContentTypes, &c.Status, &nullableEnds, &created)
	if err != nil {
		return Campaign{}, "", err
	}
	if nullableEnds != nil {
		value := nullableEnds.UTC().Format(time.RFC3339Nano)
		c.EndsAt = &value
	}
	c.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	return c, businessID, nil
}

func (r *PostgresRepository) businessCampaigns(ctx context.Context, businessID string) ([]Campaign, error) {
	rows, err := r.db.Query(ctx, `select id::text,business_id::text,title,goal,requirements,budget_text,creator_slots,content_types,status,ends_at,created_at from public.business_campaigns where business_id=$1 order by created_at desc,id limit 100`, businessID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Campaign{}
	for rows.Next() {
		c, _, err := scanCampaign(rows)
		if err != nil {
			return nil, ErrUnavailable
		}
		c.Applications = []Application{}
		items = append(items, c)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	applications, err := r.applicationsForBusiness(ctx, businessID)
	if err != nil {
		return nil, err
	}
	for index := range items {
		items[index].Applications = applications[items[index].ID]
		if items[index].Applications == nil {
			items[index].Applications = []Application{}
		}
	}
	return items, nil
}

func (r *PostgresRepository) applicationsForBusiness(ctx context.Context, businessID string) (map[string][]Application, error) {
	rows, err := r.db.Query(ctx, `select a.campaign_id::text,a.id::text,a.editor_id::text,a.portfolio_url,a.note,a.status,a.created_at,p.display_name,p.username::text
		from public.business_campaign_applications a
		join public.business_campaigns c on c.id=a.campaign_id
		join public.profiles p on p.id=a.editor_id
		where c.business_id=$1 order by a.created_at desc,a.id limit 5000`, businessID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := make(map[string][]Application)
	for rows.Next() {
		var a Application
		var campaignID string
		var created time.Time
		var editor Editor
		if rows.Scan(&campaignID, &a.ID, &a.EditorID, &a.PortfolioURL, &a.Note, &a.Status, &created, &editor.DisplayName, &editor.Username) != nil {
			return nil, ErrUnavailable
		}
		a.CreatedAt = created.UTC().Format(time.RFC3339Nano)
		a.Editor = &editor
		items[campaignID] = append(items[campaignID], a)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) editorCampaigns(ctx context.Context, subject string) ([]Campaign, error) {
	rows, err := r.db.Query(ctx, `select c.id::text,c.business_id::text,c.title,c.goal,c.requirements,c.budget_text,c.creator_slots,c.content_types,c.status,c.ends_at,c.created_at,b.name,b.verified,b.verification_level,a.status
		from public.business_campaigns c join public.businesses b on b.id=c.business_id and b.verified
		left join public.business_campaign_applications a on a.campaign_id=c.id and a.editor_id=$1
		where c.status='open' order by c.created_at desc,c.id limit 100`, subject)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Campaign{}
	for rows.Next() {
		var c Campaign
		var businessID string
		var ends *time.Time
		var created time.Time
		var b Business
		if rows.Scan(&c.ID, &businessID, &c.Title, &c.Goal, &c.Requirements, &c.BudgetText, &c.CreatorSlots, &c.ContentTypes, &c.Status, &ends, &created, &b.Name, &b.Verified, &b.VerificationLevel, &c.MyStatus) != nil {
			return nil, ErrUnavailable
		}
		b.ID = businessID
		c.Business = &b
		if ends != nil {
			v := ends.UTC().Format(time.RFC3339Nano)
			c.EndsAt = &v
		}
		c.CreatedAt = created.UTC().Format(time.RFC3339Nano)
		items = append(items, c)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) Create(ctx context.Context, _ string, subject string, input CreateInput) (Campaign, error) {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Campaign{}, ErrUnavailable
	}
	var c Campaign
	var created time.Time
	var ends *time.Time
	var requestedEnds *time.Time
	if input.EndsAt != nil {
		parsed, err := time.Parse(time.RFC3339, *input.EndsAt)
		if err != nil {
			return Campaign{}, ErrInvalid
		}
		requestedEnds = &parsed
	}
	err := r.db.QueryRow(ctx, `insert into public.business_campaigns(business_id,title,goal,requirements,budget_text,creator_slots,content_types,status,ends_at)
		select b.id,$2,$3,$4,$5,$6,$7,'open',$8 from public.businesses b where b.owner_id=$1 and b.verified
		returning id::text,title,goal,requirements,budget_text,creator_slots,content_types,status,ends_at,created_at`, subject, input.Title, input.Goal, input.Requirements, input.BudgetText, input.CreatorSlots, input.ContentTypes, requestedEnds).Scan(&c.ID, &c.Title, &c.Goal, &c.Requirements, &c.BudgetText, &c.CreatorSlots, &c.ContentTypes, &c.Status, &ends, &created)
	if errors.Is(err, pgx.ErrNoRows) {
		return Campaign{}, ErrForbidden
	}
	if err != nil {
		return Campaign{}, ErrUnavailable
	}
	if ends != nil {
		v := ends.UTC().Format(time.RFC3339Nano)
		c.EndsAt = &v
	}
	c.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	return c, nil
}

func (r *PostgresRepository) Apply(ctx context.Context, _ string, subject string, input ApplyInput) error {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return ErrUnavailable
	}
	var allowed bool
	err := r.db.QueryRow(ctx, `select p.role='editor' and p.level>=2 and p.xp>=300 and (coalesce(p.onboarding->>'ageGroup','18+')='18+' or p.guardian_verified) from public.profiles p where p.id=$1`, subject).Scan(&allowed)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return ErrUnavailable
	}
	if !allowed {
		return ErrForbidden
	}
	command, err := r.db.Exec(ctx, `insert into public.business_campaign_applications(campaign_id,editor_id,portfolio_url,note,status)
		select c.id,$2,nullif($3,''),nullif($4,''),'applied' from public.business_campaigns c join public.businesses b on b.id=c.business_id and b.verified where c.id=$1 and c.status='open'
		on conflict(campaign_id,editor_id) do update set portfolio_url=excluded.portfolio_url,note=excluded.note,status='applied'`, input.CampaignID, subject, input.PortfolioURL, input.Note)
	if err != nil {
		return ErrUnavailable
	}
	if command.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) SetApplicationStatus(ctx context.Context, _ string, subject, applicationID, status string) (string, error) {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(applicationID) || !ValidStatus(status) {
		return "", ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return "", ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var campaignID, editorID, businessID, businessName, title string
	err = tx.QueryRow(ctx, `select c.id::text,a.editor_id::text,b.id::text,b.name,c.title from public.business_campaign_applications a join public.business_campaigns c on c.id=a.campaign_id join public.businesses b on b.id=c.business_id where a.id=$1 and b.owner_id=$2 for update of a`, applicationID, subject).Scan(&campaignID, &editorID, &businessID, &businessName, &title)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrForbidden
	}
	if err != nil {
		return "", ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `update public.business_campaign_applications set status=$2 where id=$1`, applicationID, status); err != nil {
		return "", ErrUnavailable
	}
	conversationID := ""
	if status == "accepted" {
		err = tx.QueryRow(ctx, `insert into public.private_conversations(editor_id,business_id,business_owner_id,source_kind,source_id,company_name,title)
		values($1,$2,$3,'campaign',$4,$5,$6) on conflict(source_kind,source_id,editor_id) do update set status='active' returning id::text`, editorID, businessID, subject, campaignID, businessName, title).Scan(&conversationID)
		if err != nil {
			return "", ErrUnavailable
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return "", ErrUnavailable
	}
	return conversationID, nil
}
