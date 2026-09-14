package jobs

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
	var eligible bool
	err := r.db.QueryRow(ctx, `select role,role='editor' and level>=2 and xp>=300 and (coalesce(onboarding->>'ageGroup','18+')='18+' or guardian_verified) from public.profiles where id=$1`, subject).Scan(&role, &eligible)
	if errors.Is(err, pgx.ErrNoRows) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, ErrUnavailable
	}
	view := View{Mode: "editor", EditorEligible: eligible, Jobs: []Job{}}
	if role == "business" {
		view.Mode = "business"
		var businessID string
		err = r.db.QueryRow(ctx, `select id::text,verified from public.businesses where owner_id=$1`, subject).Scan(&businessID, &view.BusinessVerified)
		if errors.Is(err, pgx.ErrNoRows) {
			return view, nil
		}
		if err != nil {
			return View{}, ErrUnavailable
		}
		view.BusinessID = &businessID
		view.Jobs, err = r.businessJobs(ctx, businessID)
		if err != nil {
			return View{}, err
		}
		return view, nil
	}
	view.Jobs, err = r.editorJobs(ctx, subject)
	if err != nil {
		return View{}, err
	}
	return view, nil
}

func scanJob(rows pgx.Rows) (Job, string, error) {
	var item Job
	var businessID string
	err := rows.Scan(&item.ID, &businessID, &item.Title, &item.Description, &item.BudgetMinCents, &item.BudgetMaxCents, &item.PaymentPoints, &item.Status)
	return item, businessID, err
}

func (r *PostgresRepository) businessJobs(ctx context.Context, businessID string) ([]Job, error) {
	rows, err := r.db.Query(ctx, `select id::text,business_id::text,title,description,budget_min_cents,budget_max_cents,payment_points,status from public.jobs where business_id=$1 order by created_at desc,id limit 100`, businessID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Job{}
	for rows.Next() {
		item, _, err := scanJob(rows)
		if err != nil {
			return nil, ErrUnavailable
		}
		item.Applications = []Application{}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	apps, err := r.businessApplications(ctx, businessID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Applications = apps[items[i].ID]
		if items[i].Applications == nil {
			items[i].Applications = []Application{}
		}
	}
	return items, nil
}

func (r *PostgresRepository) businessApplications(ctx context.Context, businessID string) (map[string][]Application, error) {
	rows, err := r.db.Query(ctx, `select a.job_id::text,a.editor_id::text,a.status,a.created_at,p.display_name,p.username::text from public.job_applications a join public.jobs j on j.id=a.job_id join public.profiles p on p.id=a.editor_id where j.business_id=$1 order by a.created_at desc limit 5000`, businessID)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := map[string][]Application{}
	for rows.Next() {
		var a Application
		var created time.Time
		var editor Editor
		if rows.Scan(&a.JobID, &a.EditorID, &a.Status, &created, &editor.DisplayName, &editor.Username) != nil {
			return nil, ErrUnavailable
		}
		a.CreatedAt = created.UTC().Format(time.RFC3339Nano)
		a.Editor = &editor
		items[a.JobID] = append(items[a.JobID], a)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) editorJobs(ctx context.Context, subject string) ([]Job, error) {
	rows, err := r.db.Query(ctx, `select j.id::text,j.business_id::text,j.title,j.description,j.budget_min_cents,j.budget_max_cents,j.payment_points,j.status,b.name,b.verified,b.verification_level,a.status from public.jobs j join public.businesses b on b.id=j.business_id and b.verified left join public.job_applications a on a.job_id=j.id and a.editor_id=$1 where j.status='open' order by j.created_at desc,j.id limit 100`, subject)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Job{}
	for rows.Next() {
		var item Job
		var businessID string
		var b Business
		if rows.Scan(&item.ID, &businessID, &item.Title, &item.Description, &item.BudgetMinCents, &item.BudgetMaxCents, &item.PaymentPoints, &item.Status, &b.Name, &b.Verified, &b.VerificationLevel, &item.MyStatus) != nil {
			return nil, ErrUnavailable
		}
		item.Business = &b
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) Create(ctx context.Context, _ string, subject string, input CreateInput) (Job, error) {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Job{}, ErrUnavailable
	}
	var item Job
	var businessID string
	err := r.db.QueryRow(ctx, `insert into public.jobs(business_id,title,description,payment_points,status) select id,$2,$3,$4,'open' from public.businesses where owner_id=$1 and verified returning id::text,business_id::text,title,description,budget_min_cents,budget_max_cents,payment_points,status`, subject, input.Title, input.Description, input.PaymentPoints).Scan(&item.ID, &businessID, &item.Title, &item.Description, &item.BudgetMinCents, &item.BudgetMaxCents, &item.PaymentPoints, &item.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrForbidden
	}
	if err != nil {
		return Job{}, ErrUnavailable
	}
	return item, nil
}

func (r *PostgresRepository) Apply(ctx context.Context, _ string, subject, jobID string) error {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(jobID) {
		return ErrInvalid
	}
	var allowed bool
	err := r.db.QueryRow(ctx, `select role='editor' and level>=2 and xp>=300 and (coalesce(onboarding->>'ageGroup','18+')='18+' or guardian_verified) from public.profiles where id=$1`, subject).Scan(&allowed)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return ErrUnavailable
	}
	if !allowed {
		return ErrForbidden
	}
	command, err := r.db.Exec(ctx, `insert into public.job_applications(job_id,editor_id,status) select j.id,$2,'applied' from public.jobs j join public.businesses b on b.id=j.business_id and b.verified where j.id=$1 and j.status='open' on conflict(job_id,editor_id) do update set status=case when job_applications.status='accepted' then 'accepted' else 'applied' end`, jobID, subject)
	if err != nil {
		return ErrUnavailable
	}
	if command.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) Accept(ctx context.Context, _ string, subject, jobID, editorID string) (AcceptResult, error) {
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(jobID) || !uuidPattern.MatchString(editorID) {
		return AcceptResult{}, ErrInvalid
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var businessID, businessName, title, status string
	var points int64
	err = tx.QueryRow(ctx, `select b.id::text,b.name,j.title,j.status,j.payment_points from public.jobs j join public.businesses b on b.id=j.business_id where j.id=$1 and b.owner_id=$2 and b.verified for update of j`, jobID, subject).Scan(&businessID, &businessName, &title, &status, &points)
	if errors.Is(err, pgx.ErrNoRows) {
		return AcceptResult{}, ErrForbidden
	}
	if err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if status != "open" || points < 100 {
		return AcceptResult{}, ErrConflict
	}
	var applicationStatus string
	err = tx.QueryRow(ctx, `select status from public.job_applications where job_id=$1 and editor_id=$2 for update`, jobID, editorID).Scan(&applicationStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return AcceptResult{}, ErrNotFound
	}
	if err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	var existingOrder, existingConversation, existingEditor string
	err = tx.QueryRow(ctx, `select id::text,coalesce(conversation_id::text,''),editor_id::text from public.work_orders where job_id=$1`, jobID).Scan(&existingOrder, &existingConversation, &existingEditor)
	if err == nil {
		if existingEditor != editorID || existingConversation == "" {
			return AcceptResult{}, ErrConflict
		}
		if _, err = tx.Exec(ctx, `update public.job_applications set status='accepted' where job_id=$1 and editor_id=$2`, jobID, editorID); err != nil {
			return AcceptResult{}, ErrUnavailable
		}
		if err = tx.Commit(ctx); err != nil {
			return AcceptResult{}, ErrUnavailable
		}
		return AcceptResult{OK: true, ConversationID: existingConversation, WorkOrderID: existingOrder}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return AcceptResult{}, ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `insert into public.work_wallets(user_id) values($1) on conflict(user_id) do nothing`, subject); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	var available int64
	if err = tx.QueryRow(ctx, `select available_points from public.work_wallets where user_id=$1 for update`, subject).Scan(&available); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if available < points {
		return AcceptResult{}, ErrInsufficient
	}
	var conversationID string
	err = tx.QueryRow(ctx, `insert into public.private_conversations(editor_id,business_id,business_owner_id,source_kind,source_id,company_name,title) values($1,$2,$3,'job',$4,$5,$6) on conflict(source_kind,source_id,editor_id) do update set status='active' returning id::text`, editorID, businessID, subject, jobID, businessName, "Вакансия: "+title).Scan(&conversationID)
	if err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	var orderID string
	err = tx.QueryRow(ctx, `insert into public.work_orders(job_id,customer_id,editor_id,conversation_id,gross_points,platform_fee_points,editor_points) values($1,$2,$3,$4,$5,0,$5) returning id::text`, jobID, subject, editorID, conversationID, points).Scan(&orderID)
	if err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `update public.work_wallets set available_points=available_points-$2,reserved_points=reserved_points+$2,updated_at=now() where user_id=$1`, subject, points); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `insert into public.work_point_events(user_id,work_order_id,kind,points) values($1,$2,'reserve',$3)`, subject, orderID, -points); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `update public.job_applications set status='accepted' where job_id=$1 and editor_id=$2`, jobID, editorID); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return AcceptResult{}, ErrUnavailable
	}
	return AcceptResult{OK: true, ConversationID: conversationID, WorkOrderID: orderID}, nil
}
