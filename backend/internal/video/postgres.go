package video

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const feedLimit = 30

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Feed(ctx context.Context, subject string) (Feed, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Feed{}, ErrUnavailable
	}
	var viewerKind string
	if err := r.db.QueryRow(ctx, `select case when role='editor' then 'editor' when role='creator' or onboarding->>'accountKind'='creator' then 'creator' else 'business' end from public.profiles where id=$1`, subject).Scan(&viewerKind); errors.Is(err, pgx.ErrNoRows) {
		return Feed{}, ErrNotFound
	} else if err != nil {
		return Feed{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select i.id::text,i.editor_id::text,left(i.title,160),left(i.video_url,1001),i.tags[1:12],i.ai_score,
		       i.object_id is not null,i.created_at,left(coalesce(p.display_name,'Участник KIVRONIX'),120),
		       coalesce(p.username::text,''),left(coalesce(p.avatar_url,''),1001),
		       case when p.role='editor' then 'editor' when p.role='creator' or p.onboarding->>'accountKind'='creator' then 'creator' else 'business' end,
		       coalesce(b.verified,false),
		       (select count(*) from public.portfolio_video_likes l where l.video_id=i.id),
		       (select count(*) from public.portfolio_video_comments c where c.video_id=i.id and c.status='visible'),
		       (select count(*) from public.portfolio_video_share_events s where s.video_id=i.id),
		       exists(select 1 from public.portfolio_video_likes l where l.video_id=i.id and l.user_id=$1),
		       exists(select 1 from public.profile_follows f where f.follower_id=$1 and f.following_id=i.editor_id)
		from public.portfolio_items i join public.profiles p on p.id=i.editor_id
		left join public.businesses b on b.owner_id=p.id
		order by i.created_at desc,i.id desc limit $2`, subject, feedLimit)
	if err != nil {
		return Feed{}, ErrUnavailable
	}
	defer rows.Close()
	result := Feed{ViewerKind: viewerKind, Clips: []Clip{}}
	ids := []string{}
	for rows.Next() {
		var clip Clip
		var authorID, rawURL string
		var created time.Time
		if rows.Scan(&clip.ID, &authorID, &clip.Title, &rawURL, &clip.Tags, &clip.AIScore, &clip.StorageBacked, &created,
			&clip.Author.DisplayName, &clip.Author.Username, &clip.Author.AvatarURL, &clip.Author.Kind, &clip.Author.Verified,
			&clip.Likes, &clip.CommentsCount, &clip.Shares, &clip.Liked, &clip.Following) != nil {
			return Feed{}, ErrUnavailable
		}
		clip.DisplayURL = SafeURL(rawURL)
		clip.Author.AvatarURL = SafeURL(clip.Author.AvatarURL)
		clip.CreatedAt = created.UTC().Format(time.RFC3339Nano)
		clip.Own = strings.EqualFold(authorID, subject)
		clip.Comments = []Comment{}
		if clip.Tags == nil {
			clip.Tags = []string{}
		}
		if !clip.Own && viewerKind == "editor" && clip.Author.Kind != "editor" {
			clip.CTA = "Смонтировать похожий ролик"
		}
		if !clip.Own && viewerKind != "editor" && clip.Author.Kind == "editor" {
			clip.CTA = "Выбрать этого монтажёра"
		}
		ids = append(ids, clip.ID)
		result.Clips = append(result.Clips, clip)
	}
	if rows.Err() != nil {
		return Feed{}, ErrUnavailable
	}
	if len(ids) == 0 {
		return result, nil
	}
	commentRows, err := r.db.Query(ctx, `
		select id::text,video_id::text,body,created_at,display_name,username,avatar_url,kind,verified from (
		 select c.id,c.video_id,left(c.body,500) body,c.created_at,left(coalesce(p.display_name,'Участник'),120) display_name,
		 coalesce(p.username::text,'') username,left(coalesce(p.avatar_url,''),1001) avatar_url,
		 case when p.role='editor' then 'editor' when p.role='creator' or p.onboarding->>'accountKind'='creator' then 'creator' else 'business' end kind,
		 coalesce(b.verified,false) verified,row_number() over(partition by c.video_id order by c.created_at desc,c.id desc) rn
		 from public.portfolio_video_comments c join public.profiles p on p.id=c.user_id left join public.businesses b on b.owner_id=p.id
		 where c.video_id=any($1::uuid[]) and c.status='visible'
		) recent where rn<=3 order by created_at,id`, ids)
	if err != nil {
		return Feed{}, ErrUnavailable
	}
	defer commentRows.Close()
	byID := make(map[string]int, len(result.Clips))
	for i := range result.Clips {
		byID[result.Clips[i].ID] = i
	}
	for commentRows.Next() {
		var c Comment
		var videoID, avatar string
		var created time.Time
		if commentRows.Scan(&c.ID, &videoID, &c.Body, &created, &c.Author.DisplayName, &c.Author.Username, &avatar, &c.Author.Kind, &c.Author.Verified) != nil {
			return Feed{}, ErrUnavailable
		}
		c.CreatedAt = created.UTC().Format(time.RFC3339Nano)
		c.Author.AvatarURL = SafeURL(avatar)
		if index, ok := byID[videoID]; ok {
			result.Clips[index].Comments = append(result.Clips[index].Comments, c)
		}
	}
	if commentRows.Err() != nil {
		return Feed{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) Act(ctx context.Context, subject string, input ActionInput) (ActionResult, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return ActionResult{}, ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return ActionResult{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var ownerID, ownerKind, viewerKind, title string
	err = tx.QueryRow(ctx, `select i.editor_id::text,left(i.title,160),case when op.role='editor' then 'editor' when op.role='creator' or op.onboarding->>'accountKind'='creator' then 'creator' else 'business' end,case when vp.role='editor' then 'editor' when vp.role='creator' or vp.onboarding->>'accountKind'='creator' then 'creator' else 'business' end from public.portfolio_items i join public.profiles op on op.id=i.editor_id join public.profiles vp on vp.id=$1 where i.id=$2 for update of i`, subject, input.VideoID).Scan(&ownerID, &title, &ownerKind, &viewerKind)
	if errors.Is(err, pgx.ErrNoRows) {
		return ActionResult{}, ErrNotFound
	}
	if err != nil {
		return ActionResult{}, ErrUnavailable
	}
	result := ActionResult{OK: true}
	switch input.Action {
	case "like":
		var active bool
		err = tx.QueryRow(ctx, `with removed as (delete from public.portfolio_video_likes where video_id=$1 and user_id=$2 returning 1),added as (insert into public.portfolio_video_likes(video_id,user_id) select $1,$2 where not exists(select 1 from removed) returning 1) select exists(select 1 from added)`, input.VideoID, subject).Scan(&active)
		result.Active = &active
	case "follow":
		if strings.EqualFold(ownerID, subject) {
			return ActionResult{}, ErrForbidden
		}
		var active bool
		err = tx.QueryRow(ctx, `with removed as (delete from public.profile_follows where follower_id=$1 and following_id=$2 returning 1),added as (insert into public.profile_follows(follower_id,following_id) select $1,$2 where not exists(select 1 from removed) returning 1) select exists(select 1 from added)`, subject, ownerID).Scan(&active)
		result.Active = &active
	case "comment":
		_, err = tx.Exec(ctx, `insert into public.portfolio_video_comments(id,video_id,user_id,body) values($1,$2,$3,$4) on conflict(id) do nothing`, input.ID, input.VideoID, subject, input.Body)
	case "share":
		_, err = tx.Exec(ctx, `insert into public.portfolio_video_share_events(id,video_id,user_id) values($1,$2,$3) on conflict(id) do nothing`, input.ID, input.VideoID, subject)
	case "open_chat":
		if strings.EqualFold(ownerID, subject) || viewerKind == ownerKind {
			return ActionResult{}, ErrForbidden
		}
		var editorID, businessOwnerID string
		if viewerKind == "editor" {
			editorID = subject
			businessOwnerID = ownerID
		} else if ownerKind == "editor" {
			editorID = ownerID
			businessOwnerID = subject
		} else {
			return ActionResult{}, ErrForbidden
		}
		var businessID string
		var companyName string
		err = tx.QueryRow(ctx, `select b.id::text,b.name from public.businesses b where b.owner_id=$1 and b.verified for update`, businessOwnerID).Scan(&businessID, &companyName)
		if errors.Is(err, pgx.ErrNoRows) {
			return ActionResult{}, ErrForbidden
		}
		if err != nil {
			return ActionResult{}, ErrUnavailable
		}
		var requestID string
		err = tx.QueryRow(ctx, `insert into public.video_contact_requests(id,video_id,requester_id,editor_id,business_id) values(gen_random_uuid(),$1,$2,$3,$4) on conflict(video_id,requester_id) do update set video_id=excluded.video_id returning id::text`, input.VideoID, subject, editorID, businessID).Scan(&requestID)
		if err == nil {
			err = tx.QueryRow(ctx, `insert into public.private_conversations(editor_id,business_id,business_owner_id,source_kind,source_id,company_name,title) values($1,$2,$3,'video',$4,$5,$6) on conflict(source_kind,source_id,editor_id) do update set title=excluded.title returning id::text`, editorID, businessID, businessOwnerID, requestID, companyName, "KIVRONIX Video · "+title).Scan(&result.ConversationID)
		}
		if err == nil {
			_, err = tx.Exec(ctx, `update public.video_contact_requests set conversation_id=$1 where id=$2`, result.ConversationID, requestID)
		}
	}
	if err != nil {
		return ActionResult{}, ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return ActionResult{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) Competitions(ctx context.Context, subject string) ([]Competition, error) {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return nil, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `select c.id::text,left(c.title,120),left(c.brief,3000),left(c.prize_text,300),c.ends_at,left(coalesce(p.display_name,'Автор KIVRONIX'),120),count(e.id),c.host_id=$1,exists(select 1 from public.creator_competition_entries mine where mine.competition_id=c.id and mine.participant_id=$1),case when vp.role='editor' then true when vp.role='creator' or vp.onboarding->>'accountKind'='creator' then true else false end,exists(select 1 from public.businesses b where b.owner_id=$1 and b.verified and (vp.role='creator' or vp.onboarding->>'accountKind'='creator')),coalesce(max(i.title) filter(where e.status='winner'),'') from public.creator_competitions c join public.profiles p on p.id=c.host_id join public.profiles vp on vp.id=$1 left join public.creator_competition_entries e on e.competition_id=c.id left join public.portfolio_items i on i.id=e.portfolio_item_id where c.status='open' and c.ends_at>now() group by c.id,p.display_name,vp.role,vp.onboarding order by c.created_at desc,c.id limit 50`, subject)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Competition{}
	for rows.Next() {
		var item Competition
		var ends time.Time
		if rows.Scan(&item.ID, &item.Title, &item.Brief, &item.PrizeText, &ends, &item.HostName, &item.Entries, &item.Owned, &item.Entered, &item.CanEnter, &item.CanCreate, &item.WinningTitle) != nil {
			return nil, ErrUnavailable
		}
		item.EndsAt = ends.UTC().Format(time.RFC3339Nano)
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}

func (r *PostgresRepository) CompetitionAction(ctx context.Context, subject string, input CompetitionInput) error {
	subject = normalizeID(subject)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return ErrUnavailable
	}
	if input.Action == "create" {
		ends, err := time.Parse(time.RFC3339, input.EndsAt)
		if err != nil {
			return ErrInvalid
		}
		tag, err := r.db.Exec(ctx, `insert into public.creator_competitions(host_id,title,brief,prize_text,ends_at) select p.id,$2,$3,$4,$5 from public.profiles p join public.businesses b on b.owner_id=p.id and b.verified where p.id=$1 and (p.role='creator' or p.onboarding->>'accountKind'='creator')`, subject, input.Title, input.Brief, input.PrizeText, ends)
		if err != nil {
			return ErrUnavailable
		}
		if tag.RowsAffected() != 1 {
			return ErrForbidden
		}
		return nil
	}
	tag, err := r.db.Exec(ctx, `insert into public.creator_competition_entries(competition_id,participant_id,portfolio_item_id) select c.id,$1,i.id from public.creator_competitions c join public.portfolio_items i on i.id=$3 and i.editor_id=$1 join public.profiles p on p.id=$1 where c.id=$2 and c.status='open' and c.ends_at>now() and (p.role='editor' or p.role='creator' or p.onboarding->>'accountKind'='creator') on conflict(competition_id,participant_id) do update set portfolio_item_id=excluded.portfolio_item_id,status='submitted'`, subject, input.CompetitionID, input.VideoID)
	if err != nil {
		return ErrUnavailable
	}
	if tag.RowsAffected() != 1 {
		return ErrForbidden
	}
	return nil
}
