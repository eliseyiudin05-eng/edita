package chat

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) ListConversations(ctx context.Context, _ string, subject string) (ConversationList, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !validUUID(subject) {
		return ConversationList{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select c.id::text,c.editor_id::text,c.source_kind,c.source_id::text,c.company_name,c.title,c.status,
		       c.last_message_at,c.created_at,p.display_name,p.username::text,p.avatar_url,
		       w.id::text,w.gross_points,w.editor_points,w.platform_fee_points,w.status,
		       d.preview_name,d.original_name,d.submitted_at
		from public.private_conversations c
		left join public.profiles p on p.id=c.editor_id
		left join public.work_orders w on w.conversation_id=c.id
		left join public.work_order_deliverables d on d.work_order_id=w.id
		where c.editor_id=$1 or c.business_owner_id=$1
		order by c.last_message_at desc,c.id limit $2`, subject, maxConversations)
	if err != nil {
		return ConversationList{}, ErrUnavailable
	}
	defer rows.Close()
	result := ConversationList{ViewerID: subject, Conversations: []ConversationSummary{}}
	for rows.Next() {
		var summary ConversationSummary
		var editorID string
		var lastMessageAt, createdAt time.Time
		var displayName, editorUsername, editorAvatar *string
		var workOrderID, workOrderStatus, previewName, originalName *string
		var grossPoints, editorPoints, platformFeePoints *int64
		var submittedAt *time.Time
		if rows.Scan(&summary.ID, &editorID, &summary.SourceKind, &summary.SourceID, &summary.CompanyName,
			&summary.Title, &summary.Status, &lastMessageAt, &createdAt, &displayName, &editorUsername, &editorAvatar,
			&workOrderID, &grossPoints, &editorPoints, &platformFeePoints, &workOrderStatus,
			&previewName, &originalName, &submittedAt) != nil {
			return ConversationList{}, ErrUnavailable
		}
		summary.LastMessageAt = lastMessageAt.UTC().Format(time.RFC3339Nano)
		summary.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		summary.Side = "company"
		summary.OtherName = "Монтажёр"
		if strings.EqualFold(editorID, subject) {
			summary.Side = "editor"
			summary.OtherName = summary.CompanyName
		} else {
			if displayName != nil && strings.TrimSpace(*displayName) != "" {
				summary.OtherName = *displayName
			}
			summary.OtherUsername = editorUsername
			summary.OtherAvatar = editorAvatar
		}
		if workOrderID != nil && grossPoints != nil && editorPoints != nil && platformFeePoints != nil && workOrderStatus != nil {
			summary.WorkOrder = &WorkOrder{ID: *workOrderID, GrossPoints: *grossPoints, EditorPoints: *editorPoints,
				PlatformFeePoints: *platformFeePoints, Status: *workOrderStatus}
			if previewName != nil && originalName != nil && submittedAt != nil {
				summary.WorkOrder.Deliverable = &Deliverable{PreviewName: *previewName, OriginalName: *originalName,
					SubmittedAt: submittedAt.UTC().Format(time.RFC3339Nano)}
			}
		}
		result.Conversations = append(result.Conversations, summary)
	}
	if rows.Err() != nil {
		return ConversationList{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) GetThread(ctx context.Context, _ string, subject, conversationID string) (Thread, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	conversationID = strings.ToLower(strings.TrimSpace(conversationID))
	if r == nil || r.db == nil || !validUUID(subject) || !validUUID(conversationID) {
		return Thread{}, ErrUnavailable
	}
	conversation, err := r.conversationForViewer(ctx, subject, conversationID, false)
	if err != nil {
		return Thread{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select id::text,conversation_id::text,sender_id::text,body,created_at
		from public.private_messages where conversation_id=$1 order by created_at,id limit $2`, conversationID, maxMessages+1)
	if err != nil {
		return Thread{}, ErrUnavailable
	}
	defer rows.Close()
	messages := []Message{}
	for rows.Next() {
		if len(messages) == maxMessages {
			return Thread{}, ErrUnavailable
		}
		var message Message
		var createdAt time.Time
		if rows.Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.Body, &createdAt) != nil {
			return Thread{}, ErrUnavailable
		}
		message.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		messages = append(messages, message)
	}
	if rows.Err() != nil {
		return Thread{}, ErrUnavailable
	}
	return Thread{ViewerID: subject, Conversation: conversation, Messages: messages}, nil
}

func (r *PostgresRepository) CreateMessage(ctx context.Context, _ string, subject string, input CreateMessageInput) (CreateMessageResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	input.ID = strings.ToLower(strings.TrimSpace(input.ID))
	input.ConversationID = strings.ToLower(strings.TrimSpace(input.ConversationID))
	if r == nil || r.db == nil || !validUUID(subject) || !ValidCreateMessage(input) {
		return CreateMessageResponse{}, ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var editorID, ownerID, status string
	err = tx.QueryRow(ctx, `select editor_id::text,business_owner_id::text,status from public.private_conversations where id=$1 for update`, input.ConversationID).
		Scan(&editorID, &ownerID, &status)
	if err != nil || status != "active" || (!strings.EqualFold(editorID, subject) && !strings.EqualFold(ownerID, subject)) {
		return CreateMessageResponse{}, ErrUnavailable
	}
	var inserted bool
	err = tx.QueryRow(ctx, `
		with created as (
		  insert into public.private_messages(id,conversation_id,sender_id,body)
		  values($1,$2,$3,$4) on conflict(id) do nothing returning true
		) select exists(select 1 from created)`, input.ID, input.ConversationID, subject, input.Body).Scan(&inserted)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if inserted {
		if _, err = tx.Exec(ctx, `update public.private_conversations set last_message_at=now() where id=$1`, input.ConversationID); err != nil {
			return CreateMessageResponse{}, ErrUnavailable
		}
	}
	var message Message
	var createdAt time.Time
	err = tx.QueryRow(ctx, `select id::text,conversation_id::text,sender_id::text,body,created_at from public.private_messages where id=$1`, input.ID).
		Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.Body, &createdAt)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if !strings.EqualFold(message.ConversationID, input.ConversationID) || !strings.EqualFold(message.SenderID, subject) || message.Body != input.Body {
		return CreateMessageResponse{}, ErrConflict
	}
	message.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
	if err = tx.Commit(ctx); err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	return CreateMessageResponse{OK: true, Message: message}, nil
}

func (r *PostgresRepository) conversationForViewer(ctx context.Context, subject, conversationID string, activeOnly bool) (Conversation, error) {
	query := `select id::text,editor_id::text,business_owner_id::text,status,company_name,title,source_kind
		from public.private_conversations where id=$1 and (editor_id=$2 or business_owner_id=$2)`
	if activeOnly {
		query += ` and status='active'`
	}
	var result Conversation
	err := r.db.QueryRow(ctx, query, conversationID, subject).Scan(&result.ID, &result.EditorID, &result.BusinessOwnerID,
		&result.Status, &result.CompanyName, &result.Title, &result.SourceKind)
	if errors.Is(err, pgx.ErrNoRows) || err != nil {
		return Conversation{}, ErrUnavailable
	}
	return result, nil
}
