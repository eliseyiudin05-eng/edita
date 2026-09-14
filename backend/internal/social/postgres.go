package social

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetRanking(ctx context.Context, _ string, subject string) (Ranking, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Ranking{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select id::text,username::text,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills
		from public.public_profiles order by rating_points desc,id limit $1`, maxRankingRows)
	if err != nil {
		return Ranking{}, ErrUnavailable
	}
	defer rows.Close()
	result := Ranking{Ranking: []RankRow{}}
	for rows.Next() {
		var id string
		var row RankRow
		if rows.Scan(&id, &row.Username, &row.DisplayName, &row.Level, &row.XP, &row.RatingPoints, &row.AIScore, &row.AvatarURL, &row.SchoolName, &row.Skills) != nil {
			return Ranking{}, ErrUnavailable
		}
		if len(row.Skills) > 3 {
			row.Skills = row.Skills[:3]
		}
		row.Viewer = strings.EqualFold(id, subject)
		result.Ranking = append(result.Ranking, row)
	}
	if rows.Err() != nil {
		return Ranking{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) GetFriendships(ctx context.Context, _ string, subject string) (Friendships, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Friendships{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select f.id::text,f.status,
		       case when f.requester_id=$1 then 'outgoing' else 'incoming' end,
		       f.created_at,p.username::text,p.display_name,p.level,p.xp,
		       greatest(0,p.xp+coalesce(p.ai_score,0)*10+p.referral_points),
		       p.ai_score,p.avatar_url,case when p.show_school_publicly then p.school_name end
		from public.friendships f
		left join public.profiles p on p.id=case when f.requester_id=$1 then f.addressee_id else f.requester_id end
		where f.requester_id=$1 or f.addressee_id=$1
		order by f.created_at desc limit $2`, subject, maxFriendRows)
	if err != nil {
		return Friendships{}, ErrUnavailable
	}
	defer rows.Close()
	result := Friendships{Relations: []FriendRelation{}}
	for rows.Next() {
		var relation FriendRelation
		var createdAt time.Time
		var profile FriendProfile
		if rows.Scan(&relation.ID, &relation.Status, &relation.Direction, &createdAt,
			&profile.Username, &profile.DisplayName, &profile.Level, &profile.XP, &profile.RatingPoints,
			&profile.AIScore, &profile.AvatarURL, &profile.SchoolName) != nil {
			return Friendships{}, ErrUnavailable
		}
		relation.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		relation.Other = &profile
		result.Relations = append(result.Relations, relation)
	}
	if rows.Err() != nil {
		return Friendships{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) CancelFriendRequest(ctx context.Context, _ string, subject, relationID string) error {
	subject = strings.ToLower(strings.TrimSpace(subject))
	relationID = strings.ToLower(strings.TrimSpace(relationID))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(relationID) {
		return ErrUnavailable
	}
	var deleted string
	err := r.db.QueryRow(ctx, `delete from public.friendships where id=$1 and requester_id=$2 and status='pending' returning id::text`, relationID, subject).Scan(&deleted)
	if err == nil {
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return ErrUnavailable
	}
	var exists bool
	if err := r.db.QueryRow(ctx, `select exists(select 1 from public.friendships where id=$1)`, relationID).Scan(&exists); err != nil {
		return ErrUnavailable
	}
	if !exists {
		return nil
	}
	return ErrForbidden
}

func (r *PostgresRepository) RespondToFriendRequest(ctx context.Context, _ string, subject, relationID, action string) (FriendshipResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	relationID = strings.ToLower(strings.TrimSpace(relationID))
	status := map[string]string{"accept": "accepted", "decline": "declined"}[action]
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(relationID) || status == "" {
		return FriendshipResponse{}, ErrUnavailable
	}
	var returned string
	err := r.db.QueryRow(ctx, `
		update public.friendships set status=$3,responded_at=now()
		where id=$1 and addressee_id=$2 and status='pending' returning status`, relationID, subject, status).Scan(&returned)
	if err == nil {
		return FriendshipResponse{OK: true, Status: returned}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return FriendshipResponse{}, ErrUnavailable
	}
	var addressee, current string
	err = r.db.QueryRow(ctx, `select addressee_id::text,status from public.friendships where id=$1`, relationID).Scan(&addressee, &current)
	if errors.Is(err, pgx.ErrNoRows) {
		return FriendshipResponse{}, ErrNotFound
	}
	if err != nil {
		return FriendshipResponse{}, ErrUnavailable
	}
	if strings.EqualFold(addressee, subject) && current == status {
		return FriendshipResponse{OK: true, Status: status}, nil
	}
	return FriendshipResponse{}, ErrForbidden
}

func (r *PostgresRepository) GetGroups(ctx context.Context, _ string, subject string) (Groups, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Groups{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		with own_groups as (
		  select group_id from public.study_group_members where user_id=$1 order by joined_at desc limit $2
		)
		select g.id::text,g.name,nullif(g.description,''),g.age_scope,g.join_code,g.max_members,g.created_at,
		       m.user_id::text,m.role,m.joined_at,p.username::text,p.display_name,p.level,p.xp,
		       greatest(0,p.xp+coalesce(p.ai_score,0)*10+p.referral_points),p.ai_score,p.avatar_url,
		       case when p.show_school_publicly then p.school_name end
		from own_groups og join public.study_groups g on g.id=og.group_id
		join public.study_group_members m on m.group_id=g.id
		left join public.profiles p on p.id=m.user_id
		order by g.created_at desc,g.id,m.joined_at,m.user_id
		limit $3`, subject, maxGroupRows, maxGroupMembers+1)
	if err != nil {
		return Groups{}, ErrUnavailable
	}
	defer rows.Close()
	groups := make(map[string]*StudyGroup)
	order := make([]string, 0)
	memberCount := 0
	for rows.Next() {
		memberCount++
		if memberCount > maxGroupMembers {
			return Groups{}, ErrUnavailable
		}
		var groupID, name, ageScope, joinCode, userID, memberRole string
		var description *string
		var maxMembers int64
		var createdAt, joinedAt time.Time
		var profile FriendProfile
		if rows.Scan(&groupID, &name, &description, &ageScope, &joinCode, &maxMembers, &createdAt,
			&userID, &memberRole, &joinedAt, &profile.Username, &profile.DisplayName, &profile.Level,
			&profile.XP, &profile.RatingPoints, &profile.AIScore, &profile.AvatarURL, &profile.SchoolName) != nil {
			return Groups{}, ErrUnavailable
		}
		group := groups[groupID]
		if group == nil {
			group = &StudyGroup{ID: groupID, Name: name, Description: description, AgeScope: ageScope, JoinCode: joinCode,
				MaxMembers: maxMembers, CreatedAt: createdAt.UTC().Format(time.RFC3339Nano), Members: []GroupMember{}}
			groups[groupID] = group
			order = append(order, groupID)
		}
		group.Members = append(group.Members, GroupMember{UserID: userID, MemberRole: memberRole,
			JoinedAt: joinedAt.UTC().Format(time.RFC3339Nano), Profile: &profile})
	}
	if rows.Err() != nil {
		return Groups{}, ErrUnavailable
	}
	result := Groups{Groups: make([]StudyGroup, 0, len(order))}
	for _, id := range order {
		group := groups[id]
		sort.Slice(group.Members, func(i, j int) bool {
			left, right := group.Members[i].Profile.RatingPoints, group.Members[j].Profile.RatingPoints
			if left == right {
				return group.Members[i].UserID < group.Members[j].UserID
			}
			return left > right
		})
		result.Groups = append(result.Groups, *group)
	}
	return result, nil
}
