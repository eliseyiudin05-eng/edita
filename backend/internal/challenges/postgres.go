package challenges

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Get(ctx context.Context, _ string, subject string) (View, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return View{}, ErrUnavailable
	}
	var role string
	var eligible bool
	if err := r.db.QueryRow(ctx, `select role,role='editor' and level>=2 and xp>=300 and (coalesce(onboarding->>'ageGroup','18+')='18+' or guardian_verified) from public.profiles where id=$1`, subject).Scan(&role, &eligible); errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	} else if err != nil {
		return View{}, ErrUnavailable
	}
	view := View{Mode: "editor", EditorEligible: eligible, Challenges: []Challenge{}, Submissions: []Submission{}}
	if role == "business" {
		view.Mode = "business"
		var businessID string
		if err := r.db.QueryRow(ctx, `select id::text,verified from public.businesses where owner_id=$1`, subject).Scan(&businessID, &view.BusinessVerified); errors.Is(err, pgx.ErrNoRows) {
			return view, nil
		} else if err != nil {
			return View{}, ErrUnavailable
		}
		view.BusinessID = &businessID
		var err error
		view.Challenges, err = r.list(ctx, businessID, true)
		if err != nil {
			return View{}, err
		}
		view.Submissions, err = r.businessSubmissions(ctx, businessID)
		if err != nil {
			return View{}, err
		}
		return view, nil
	}
	var err error
	view.Challenges, err = r.list(ctx, "", false)
	if err != nil {
		return View{}, err
	}
	view.Submissions, err = r.editorSubmissions(ctx, subject)
	if err != nil {
		return View{}, err
	}
	return view, nil
}

func (r *PostgresRepository) list(ctx context.Context, businessID string, owned bool) ([]Challenge, error) {
	query := `select c.id::text,c.business_id::text,b.name,c.title,c.brief,c.prize_cents,c.prize_points,c.custom_prize,c.ends_at,c.status,c.source_assets,b.verified,b.verification_level from public.challenges c join public.businesses b on b.id=c.business_id where c.status='open' and b.verified and (c.ends_at is null or c.ends_at>now()) order by c.created_at desc,c.id limit 100`
	args := []any{}
	if owned {
		query = `select c.id::text,c.business_id::text,b.name,c.title,c.brief,c.prize_cents,c.prize_points,c.custom_prize,c.ends_at,c.status,c.source_assets,b.verified,b.verification_level from public.challenges c join public.businesses b on b.id=c.business_id where c.business_id=$1 order by c.created_at desc,c.id limit 100`
		args = append(args, businessID)
	}
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Challenge{}
	for rows.Next() {
		var item Challenge
		var ends *time.Time
		if rows.Scan(&item.ID, &item.BusinessID, &item.Brand, &item.Title, &item.Brief, &item.PrizeCents, &item.PrizePoints, &item.CustomPrize, &ends, &item.Status, &item.SourceAssets, &item.BrandVerified, &item.VerificationLevel) != nil {
			return nil, ErrUnavailable
		}
		if ends != nil {
			value := ends.UTC().Format(time.RFC3339Nano)
			item.EndsAt = &value
		}
		if item.SourceAssets == nil {
			item.SourceAssets = []string{}
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) businessSubmissions(ctx context.Context, businessID string) ([]Submission, error) {
	rows, err := r.db.Query(ctx, `select s.id::text,s.challenge_id::text,s.editor_id::text,coalesce(p.display_name,'Монтажёр'),s.video_url,s.ai_score,s.status from public.challenge_submissions s join public.challenges c on c.id=s.challenge_id join public.profiles p on p.id=s.editor_id where c.business_id=$1 order by s.created_at desc,s.id limit 1000`, businessID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Submission{}
	for rows.Next() {
		var item Submission
		if rows.Scan(&item.ID, &item.ChallengeID, &item.EditorID, &item.EditorName, &item.StoragePath, &item.AIScore, &item.Status) != nil {
			return nil, ErrUnavailable
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) editorSubmissions(ctx context.Context, editorID string) ([]Submission, error) {
	rows, err := r.db.Query(ctx, `select s.id::text,s.challenge_id::text,s.editor_id::text,coalesce(p.display_name,'Монтажёр'),s.video_url,s.ai_score,s.status from public.challenge_submissions s join public.profiles p on p.id=s.editor_id where s.editor_id=$1 order by s.created_at desc,s.id limit 100`, editorID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Submission{}
	for rows.Next() {
		var item Submission
		if rows.Scan(&item.ID, &item.ChallengeID, &item.EditorID, &item.EditorName, &item.StoragePath, &item.AIScore, &item.Status) != nil {
			return nil, ErrUnavailable
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) Create(ctx context.Context, _ string, subject string, input CreateInput) (Challenge, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Challenge{}, ErrUnavailable
	}
	assets, err := json.Marshal(input.SourceAssets)
	if err != nil {
		return Challenge{}, ErrInvalid
	}
	var item Challenge
	var ends *time.Time
	var requestedEnds *time.Time
	if input.EndsAt != nil {
		parsed, err := time.Parse(time.RFC3339, *input.EndsAt)
		if err != nil {
			return Challenge{}, ErrInvalid
		}
		requestedEnds = &parsed
	}
	err = r.db.QueryRow(ctx, `insert into public.challenges(business_id,title,brief,prize_cents,prize_points,custom_prize,ends_at,source_assets,status) select b.id,$2,$3,$4,$5,nullif($6,''),$7,$8::jsonb,'open' from public.businesses b where b.owner_id=$1 and b.verified returning id::text,business_id::text,title,brief,prize_cents,prize_points,custom_prize,ends_at,status,source_assets`, subject, input.Title, input.Brief, input.PrizeCents, input.PrizePoints, input.CustomPrize, requestedEnds, assets).Scan(&item.ID, &item.BusinessID, &item.Title, &item.Brief, &item.PrizeCents, &item.PrizePoints, &item.CustomPrize, &ends, &item.Status, &item.SourceAssets)
	if errors.Is(err, pgx.ErrNoRows) {
		return Challenge{}, ErrForbidden
	}
	if err != nil {
		return Challenge{}, ErrUnavailable
	}
	if ends != nil {
		value := ends.UTC().Format(time.RFC3339Nano)
		item.EndsAt = &value
	}
	return item, nil
}

func (r *PostgresRepository) Submit(ctx context.Context, _ string, subject string, input SubmitInput) (Submission, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Submission{}, ErrUnavailable
	}
	var allowed bool
	if err := r.db.QueryRow(ctx, `select role='editor' and level>=2 and xp>=300 and (coalesce(onboarding->>'ageGroup','18+')='18+' or guardian_verified) from public.profiles where id=$1`, subject).Scan(&allowed); errors.Is(err, pgx.ErrNoRows) {
		return Submission{}, ErrNotFound
	} else if err != nil {
		return Submission{}, ErrUnavailable
	}
	if !allowed {
		return Submission{}, ErrForbidden
	}
	var objectKey string
	if err := r.db.QueryRow(ctx, `select object_key from public.objects where id=$1 and owner_id=$2 and bucket_id='challenge-submissions' and content_type in ('video/mp4','video/quicktime','video/webm') and size_bytes>0`, input.ObjectID, subject).Scan(&objectKey); errors.Is(err, pgx.ErrNoRows) {
		return Submission{}, ErrForbidden
	} else if err != nil {
		return Submission{}, ErrUnavailable
	}
	var item Submission
	command := r.db.QueryRow(ctx, `insert into public.challenge_submissions(challenge_id,editor_id,video_url,object_id,status) select c.id,$2,$3,$4,'submitted' from public.challenges c join public.businesses b on b.id=c.business_id and b.verified where c.id=$1 and c.status='open' and (c.ends_at is null or c.ends_at>now()) on conflict(challenge_id,editor_id) do update set video_url=excluded.video_url,object_id=excluded.object_id,ai_score=null,ai_feedback='{}'::jsonb,status='submitted' where challenge_submissions.status='submitted' returning id::text,challenge_id::text,editor_id::text,video_url,status`, input.ChallengeID, subject, objectKey, input.ObjectID)
	if err := command.Scan(&item.ID, &item.ChallengeID, &item.EditorID, &item.StoragePath, &item.Status); errors.Is(err, pgx.ErrNoRows) {
		return Submission{}, ErrConflict
	} else if err != nil {
		return Submission{}, ErrUnavailable
	}
	return item, nil
}

func (r *PostgresRepository) SetSubmissionStatus(ctx context.Context, _ string, subject, submissionID, status string) (WinnerResult, error) {
	subject = normalizeID(subject)
	submissionID = normalizeID(submissionID)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(submissionID) || (status != "shortlisted" && status != "winner") {
		return WinnerResult{}, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var challengeID, editorID, businessID, businessName, title, currentStatus, videoPath string
	var objectID *string
	var points, cash int64
	var aiScore *int64
	err = tx.QueryRow(ctx, `select c.id::text,s.editor_id::text,b.id::text,b.name,c.title,s.status,s.video_url,s.object_id::text,c.prize_points,c.prize_cents,s.ai_score from public.challenge_submissions s join public.challenges c on c.id=s.challenge_id join public.businesses b on b.id=c.business_id where s.id=$1 and b.owner_id=$2 and b.verified for update of c,s`, submissionID, subject).Scan(&challengeID, &editorID, &businessID, &businessName, &title, &currentStatus, &videoPath, &objectID, &points, &cash, &aiScore)
	if errors.Is(err, pgx.ErrNoRows) {
		return WinnerResult{}, ErrForbidden
	}
	if err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	if status == "shortlisted" {
		if currentStatus != "submitted" && currentStatus != "shortlisted" {
			return WinnerResult{}, ErrConflict
		}
		if _, err = tx.Exec(ctx, `update public.challenge_submissions set status='shortlisted' where id=$1`, submissionID); err != nil {
			return WinnerResult{}, ErrUnavailable
		}
		if err = tx.Commit(ctx); err != nil {
			return WinnerResult{}, ErrUnavailable
		}
		return WinnerResult{OK: true, Status: status}, nil
	}
	if currentStatus != "submitted" && currentStatus != "shortlisted" && currentStatus != "winner" {
		return WinnerResult{}, ErrConflict
	}
	var otherWinner bool
	if err = tx.QueryRow(ctx, `select exists(select 1 from public.challenge_submissions where challenge_id=$1 and status='winner' and id<>$2)`, challengeID, submissionID).Scan(&otherWinner); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	if otherWinner {
		return WinnerResult{}, ErrConflict
	}
	var otherRewardRecipient bool
	if err = tx.QueryRow(ctx, `select exists(select 1 from public.challenge_reward_events where challenge_id=$1 and submission_id<>$2) or exists(select 1 from public.challenge_cash_reward_events where challenge_id=$1 and submission_id<>$2)`, challengeID, submissionID).Scan(&otherRewardRecipient); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	if otherRewardRecipient {
		return WinnerResult{}, ErrConflict
	}
	if _, err = tx.Exec(ctx, `update public.challenge_submissions set status='winner' where id=$1`, submissionID); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	result := WinnerResult{OK: true, Status: status}
	if points > 0 {
		command, err := tx.Exec(ctx, `insert into public.challenge_reward_events(submission_id,challenge_id,user_id,points) values($1,$2,$3,$4) on conflict(challenge_id) do nothing`, submissionID, challengeID, editorID, points)
		if err != nil {
			return WinnerResult{}, ErrUnavailable
		}
		if command.RowsAffected() == 1 {
			if _, err = tx.Exec(ctx, `update public.profiles set referral_points=referral_points+$2 where id=$1`, editorID, points); err != nil {
				return WinnerResult{}, ErrUnavailable
			}
			result.PointsAwarded = points
		}
	}
	if cash > 0 {
		command, err := tx.Exec(ctx, `insert into public.challenge_cash_reward_events(submission_id,challenge_id,user_id,amount_cents) values($1,$2,$3,$4) on conflict(challenge_id) do nothing`, submissionID, challengeID, editorID, cash)
		if err != nil {
			return WinnerResult{}, ErrUnavailable
		}
		if command.RowsAffected() == 1 {
			if _, err = tx.Exec(ctx, `update public.profiles set earnings_cents=earnings_cents+$2 where id=$1`, editorID, cash); err != nil {
				return WinnerResult{}, ErrUnavailable
			}
			result.CashAwarded = cash
		}
	}
	if _, err = tx.Exec(ctx, `insert into public.portfolio_items(editor_id,title,video_url,tags,ai_score,source_kind,source_id,object_id) values($1,$2,$3,array['challenge-winner','commercial'],$4,'challenge',$5,$6) on conflict(source_kind,source_id) where source_kind is not null and source_id is not null do update set object_id=coalesce(portfolio_items.object_id,excluded.object_id)`, editorID, businessName+" — "+title, videoPath, aiScore, challengeID, objectID); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	if err = tx.QueryRow(ctx, `insert into public.private_conversations(editor_id,business_id,business_owner_id,source_kind,source_id,company_name,title) values($1,$2,$3,'challenge',$4,$5,$6) on conflict(source_kind,source_id,editor_id) do update set status='active' returning id::text`, editorID, businessID, subject, challengeID, businessName, "Победитель конкурса: "+title).Scan(&result.ConversationID); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return WinnerResult{}, ErrUnavailable
	}
	return result, nil
}
