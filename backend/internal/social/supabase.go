package social

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrForbidden   = errors.New("social operation forbidden")
	ErrUnavailable = errors.New("social service unavailable")
)

var (
	uuidPattern     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,29}$`)
)

const (
	maxRankingRows   = 50
	maxFriendRows    = 200
	maxGroupRows     = 20
	maxGroupMembers  = 500
	maxResponseBytes = 256 * 1024
)

type Ranking struct {
	Ranking []RankRow `json:"ranking"`
}

type Friendships struct {
	Relations []FriendRelation `json:"relations"`
}

type FriendRelation struct {
	ID        string         `json:"id"`
	Status    string         `json:"status"`
	Direction string         `json:"direction"`
	CreatedAt string         `json:"created_at"`
	Other     *FriendProfile `json:"other"`
}

type FriendProfile struct {
	Username     *string `json:"username"`
	DisplayName  *string `json:"display_name"`
	Level        int64   `json:"level"`
	XP           int64   `json:"xp"`
	RatingPoints int64   `json:"rating_points"`
	AIScore      *int64  `json:"ai_score"`
	AvatarURL    *string `json:"avatar_url"`
	SchoolName   *string `json:"school_name"`
}

type Groups struct {
	Groups []StudyGroup `json:"groups"`
}

type StudyGroup struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description *string       `json:"description"`
	AgeScope    string        `json:"age_scope"`
	JoinCode    string        `json:"join_code"`
	MaxMembers  int64         `json:"max_members"`
	CreatedAt   string        `json:"created_at"`
	Members     []GroupMember `json:"members"`
}

type GroupMember struct {
	UserID     string         `json:"user_id"`
	MemberRole string         `json:"member_role"`
	JoinedAt   string         `json:"joined_at"`
	Profile    *FriendProfile `json:"profile"`
}

type RankRow struct {
	Username     *string  `json:"username"`
	DisplayName  *string  `json:"display_name"`
	Level        int64    `json:"level"`
	XP           int64    `json:"xp"`
	RatingPoints int64    `json:"rating_points"`
	AIScore      *int64   `json:"ai_score"`
	AvatarURL    *string  `json:"avatar_url"`
	SchoolName   *string  `json:"school_name"`
	Skills       []string `json:"skills"`
	Viewer       bool     `json:"viewer"`
}

type profileRow struct {
	ID           string   `json:"id"`
	Username     *string  `json:"username"`
	DisplayName  *string  `json:"display_name"`
	Level        int64    `json:"level"`
	XP           int64    `json:"xp"`
	RatingPoints int64    `json:"rating_points"`
	AIScore      *int64   `json:"ai_score"`
	AvatarURL    *string  `json:"avatar_url"`
	SchoolName   *string  `json:"school_name"`
	Skills       []string `json:"skills"`
}

type friendshipRow struct {
	ID          string `json:"id"`
	RequesterID string `json:"requester_id"`
	AddresseeID string `json:"addressee_id"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

type membershipRow struct {
	GroupID    string `json:"group_id"`
	UserID     string `json:"user_id"`
	MemberRole string `json:"member_role"`
	JoinedAt   string `json:"joined_at"`
}

type groupRow struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description"`
	OwnerID     string  `json:"owner_id"`
	AgeScope    string  `json:"age_scope"`
	JoinCode    string  `json:"join_code"`
	MaxMembers  int64   `json:"max_members"`
	CreatedAt   string  `json:"created_at"`
}

type Client struct {
	rankingEndpoint string
	friendsEndpoint string
	groupsEndpoint  string
	membersEndpoint string
	publishableKey  string
	httpClient      *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase social client configuration is incomplete")
	}
	parsed, err := url.Parse(projectURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("supabase project URL is invalid")
	}
	if len(publishableKey) > 4096 || strings.ContainsAny(publishableKey, "\r\n") {
		return nil, errors.New("supabase publishable key is invalid")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}
	client := *httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{
		rankingEndpoint: projectURL + "/rest/v1/public_profiles",
		friendsEndpoint: projectURL + "/rest/v1/friendships",
		groupsEndpoint:  projectURL + "/rest/v1/study_groups",
		membersEndpoint: projectURL + "/rest/v1/study_group_members",
		publishableKey:  publishableKey,
		httpClient:      &client,
	}, nil
}

func (c *Client) GetGroups(ctx context.Context, accessToken, subject string) (Groups, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Groups{}, ErrUnavailable
	}

	ownQuery := url.Values{}
	ownQuery.Set("select", "group_id,user_id,member_role,joined_at")
	ownQuery.Set("user_id", "eq."+subject)
	ownQuery.Set("order", "joined_at.desc,group_id.asc")
	ownQuery.Set("limit", "20")
	var ownMemberships []membershipRow
	if err := c.getJSON(ctx, c.membersEndpoint+"?"+ownQuery.Encode(), accessToken, &ownMemberships); err != nil || len(ownMemberships) > maxGroupRows {
		return Groups{}, ErrUnavailable
	}
	groupIDs := make([]string, 0, len(ownMemberships))
	groupSet := make(map[string]bool, len(ownMemberships))
	for _, membership := range ownMemberships {
		if !validMembershipRow(membership) || strings.ToLower(membership.UserID) != subject {
			return Groups{}, ErrUnavailable
		}
		groupID := strings.ToLower(membership.GroupID)
		if groupSet[groupID] {
			return Groups{}, ErrUnavailable
		}
		groupSet[groupID] = true
		groupIDs = append(groupIDs, groupID)
	}
	if len(groupIDs) == 0 {
		return Groups{Groups: []StudyGroup{}}, nil
	}

	groupQuery := url.Values{}
	groupQuery.Set("select", "id,name,description,owner_id,age_scope,join_code,max_members,created_at")
	groupQuery.Set("id", "in.("+strings.Join(groupIDs, ",")+")")
	groupQuery.Set("limit", "20")
	var groupRows []groupRow
	if err := c.getJSON(ctx, c.groupsEndpoint+"?"+groupQuery.Encode(), accessToken, &groupRows); err != nil || len(groupRows) != len(groupIDs) {
		return Groups{}, ErrUnavailable
	}

	membersQuery := url.Values{}
	membersQuery.Set("select", "group_id,user_id,member_role,joined_at")
	membersQuery.Set("group_id", "in.("+strings.Join(groupIDs, ",")+")")
	membersQuery.Set("limit", "500")
	var memberRows []membershipRow
	if err := c.getJSON(ctx, c.membersEndpoint+"?"+membersQuery.Encode(), accessToken, &memberRows); err != nil || len(memberRows) > maxGroupMembers {
		return Groups{}, ErrUnavailable
	}

	memberIDs := make([]string, 0, len(memberRows))
	memberSet := make(map[string]bool, len(memberRows))
	for _, membership := range memberRows {
		if !validMembershipRow(membership) || !groupSet[strings.ToLower(membership.GroupID)] {
			return Groups{}, ErrUnavailable
		}
		userID := strings.ToLower(membership.UserID)
		if !memberSet[userID] {
			memberSet[userID] = true
			memberIDs = append(memberIDs, userID)
		}
	}

	profiles := make(map[string]profileRow, len(memberIDs))
	for start := 0; start < len(memberIDs); start += 50 {
		end := min(start+50, len(memberIDs))
		profileQuery := url.Values{}
		profileQuery.Set("select", "id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
		profileQuery.Set("id", "in.("+strings.Join(memberIDs[start:end], ",")+")")
		profileQuery.Set("limit", "50")
		var profileRows []profileRow
		if err := c.getJSON(ctx, c.rankingEndpoint+"?"+profileQuery.Encode(), accessToken, &profileRows); err != nil || len(profileRows) > 50 {
			return Groups{}, ErrUnavailable
		}
		for _, row := range profileRows {
			userID := strings.ToLower(row.ID)
			if !validRow(row) || !memberSet[userID] {
				return Groups{}, ErrUnavailable
			}
			profiles[userID] = row
		}
	}

	membersByGroup := make(map[string][]GroupMember, len(groupRows))
	for _, membership := range memberRows {
		userID := strings.ToLower(membership.UserID)
		var profile *FriendProfile
		if row, ok := profiles[userID]; ok {
			profile = &FriendProfile{
				Username: row.Username, DisplayName: row.DisplayName, Level: row.Level, XP: row.XP,
				RatingPoints: row.RatingPoints, AIScore: row.AIScore, AvatarURL: row.AvatarURL, SchoolName: row.SchoolName,
			}
		}
		groupID := strings.ToLower(membership.GroupID)
		membersByGroup[groupID] = append(membersByGroup[groupID], GroupMember{
			UserID: userID, MemberRole: membership.MemberRole, JoinedAt: membership.JoinedAt, Profile: profile,
		})
	}

	groups := make([]StudyGroup, 0, len(groupRows))
	for _, row := range groupRows {
		if !validGroupRow(row) || !groupSet[strings.ToLower(row.ID)] {
			return Groups{}, ErrUnavailable
		}
		members := membersByGroup[strings.ToLower(row.ID)]
		if members == nil {
			members = []GroupMember{}
		}
		sort.Slice(members, func(i, j int) bool {
			left, right := int64(-1), int64(-1)
			if members[i].Profile != nil {
				left = members[i].Profile.RatingPoints
			}
			if members[j].Profile != nil {
				right = members[j].Profile.RatingPoints
			}
			if left == right {
				return members[i].UserID < members[j].UserID
			}
			return left > right
		})
		groups = append(groups, StudyGroup{
			ID: row.ID, Name: row.Name, Description: row.Description, AgeScope: row.AgeScope,
			JoinCode: row.JoinCode, MaxMembers: row.MaxMembers, CreatedAt: row.CreatedAt, Members: members,
		})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].CreatedAt == groups[j].CreatedAt {
			return groups[i].ID < groups[j].ID
		}
		return groups[i].CreatedAt > groups[j].CreatedAt
	})
	return Groups{Groups: groups}, nil
}

func (c *Client) GetRanking(ctx context.Context, accessToken, subject string) (Ranking, error) {
	subject = strings.TrimSpace(subject)
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(strings.ToLower(subject)) {
		return Ranking{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
	query.Set("order", "rating_points.desc,id.asc")
	query.Set("limit", "50")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.rankingEndpoint+"?"+query.Encode(), nil)
	if err != nil {
		return Ranking{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return Ranking{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return Ranking{}, ErrUnavailable
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes {
		return Ranking{}, ErrUnavailable
	}
	var rows []profileRow
	if err := json.Unmarshal(body, &rows); err != nil || len(rows) > maxRankingRows {
		return Ranking{}, ErrUnavailable
	}
	ranking := make([]RankRow, 0, len(rows))
	for _, row := range rows {
		if !validRow(row) {
			return Ranking{}, ErrUnavailable
		}
		skills := make([]string, min(3, len(row.Skills)))
		copy(skills, row.Skills)
		ranking = append(ranking, RankRow{
			Username: row.Username, DisplayName: row.DisplayName, Level: row.Level, XP: row.XP,
			RatingPoints: row.RatingPoints, AIScore: row.AIScore, AvatarURL: row.AvatarURL,
			SchoolName: row.SchoolName, Skills: skills,
			Viewer: strings.EqualFold(row.ID, subject),
		})
	}
	return Ranking{Ranking: ranking}, nil
}

func (c *Client) GetFriendships(ctx context.Context, accessToken, subject string) (Friendships, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Friendships{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,requester_id,addressee_id,status,created_at")
	query.Set("or", "(requester_id.eq."+subject+",addressee_id.eq."+subject+")")
	query.Set("order", "created_at.desc")
	query.Set("limit", "200")
	var rows []friendshipRow
	if err := c.getJSON(ctx, c.friendsEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) > maxFriendRows {
		return Friendships{}, ErrUnavailable
	}

	otherIDs := make([]string, 0, len(rows))
	seen := make(map[string]bool, len(rows))
	for _, row := range rows {
		if !validFriendshipRow(row, subject) {
			return Friendships{}, ErrUnavailable
		}
		otherID := strings.ToLower(row.RequesterID)
		if otherID == subject {
			otherID = strings.ToLower(row.AddresseeID)
		}
		if !seen[otherID] {
			seen[otherID] = true
			otherIDs = append(otherIDs, otherID)
		}
	}

	profiles := make(map[string]profileRow, len(otherIDs))
	if len(otherIDs) > 0 {
		profileQuery := url.Values{}
		profileQuery.Set("select", "id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
		profileQuery.Set("id", "in.("+strings.Join(otherIDs, ",")+")")
		profileQuery.Set("limit", "200")
		var profileRows []profileRow
		if err := c.getJSON(ctx, c.rankingEndpoint+"?"+profileQuery.Encode(), accessToken, &profileRows); err != nil || len(profileRows) > maxFriendRows {
			return Friendships{}, ErrUnavailable
		}
		for _, row := range profileRows {
			if !validRow(row) || !seen[strings.ToLower(row.ID)] {
				return Friendships{}, ErrUnavailable
			}
			profiles[strings.ToLower(row.ID)] = row
		}
	}

	relations := make([]FriendRelation, 0, len(rows))
	for _, row := range rows {
		direction := "incoming"
		otherID := strings.ToLower(row.RequesterID)
		if otherID == subject {
			direction = "outgoing"
			otherID = strings.ToLower(row.AddresseeID)
		}
		var other *FriendProfile
		if profile, ok := profiles[otherID]; ok {
			other = &FriendProfile{
				Username: profile.Username, DisplayName: profile.DisplayName, Level: profile.Level,
				XP: profile.XP, RatingPoints: profile.RatingPoints, AIScore: profile.AIScore,
				AvatarURL: profile.AvatarURL, SchoolName: profile.SchoolName,
			}
		}
		relations = append(relations, FriendRelation{
			ID: row.ID, Status: row.Status, Direction: direction, CreatedAt: row.CreatedAt, Other: other,
		})
	}
	return Friendships{Relations: relations}, nil
}

func (c *Client) CancelFriendRequest(ctx context.Context, accessToken, subject, relationID string) error {
	subject = strings.ToLower(strings.TrimSpace(subject))
	relationID = strings.ToLower(strings.TrimSpace(relationID))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !uuidPattern.MatchString(relationID) {
		return ErrUnavailable
	}

	readQuery := url.Values{}
	readQuery.Set("select", "id,requester_id,addressee_id,status,created_at")
	readQuery.Set("id", "eq."+relationID)
	readQuery.Set("limit", "1")
	var rows []friendshipRow
	if err := c.getJSON(ctx, c.friendsEndpoint+"?"+readQuery.Encode(), accessToken, &rows); err != nil || len(rows) > 1 {
		return ErrUnavailable
	}
	if len(rows) == 0 {
		return nil
	}
	row := rows[0]
	if !validFriendshipRow(row, subject) || strings.ToLower(row.RequesterID) != subject || row.Status != "pending" {
		return ErrForbidden
	}

	deleteQuery := url.Values{}
	deleteQuery.Set("select", "id")
	deleteQuery.Set("id", "eq."+relationID)
	deleteQuery.Set("requester_id", "eq."+subject)
	deleteQuery.Set("status", "eq.pending")
	request, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.friendsEndpoint+"?"+deleteQuery.Encode(), nil)
	if err != nil {
		return ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Prefer", "return=representation")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 16*1024+1))
	if err != nil || len(body) > 16*1024 {
		return ErrUnavailable
	}
	var deleted []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(body, &deleted) != nil || len(deleted) > 1 {
		return ErrUnavailable
	}
	if len(deleted) == 0 {
		return ErrForbidden
	}
	if strings.ToLower(deleted[0].ID) != relationID {
		return ErrUnavailable
	}
	return nil
}

func (c *Client) getJSON(ctx context.Context, endpoint, accessToken string, destination any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes || json.Unmarshal(body, destination) != nil {
		return ErrUnavailable
	}
	return nil
}

func validFriendshipRow(row friendshipRow, subject string) bool {
	requester := strings.ToLower(row.RequesterID)
	addressee := strings.ToLower(row.AddresseeID)
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || !uuidPattern.MatchString(requester) || !uuidPattern.MatchString(addressee) || requester == addressee {
		return false
	}
	if requester != subject && addressee != subject {
		return false
	}
	if row.Status != "pending" && row.Status != "accepted" && row.Status != "declined" {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, row.CreatedAt)
	return err == nil
}

func ValidRelationID(value string) bool {
	return uuidPattern.MatchString(strings.ToLower(strings.TrimSpace(value)))
}

func validMembershipRow(row membershipRow) bool {
	if !uuidPattern.MatchString(strings.ToLower(row.GroupID)) || !uuidPattern.MatchString(strings.ToLower(row.UserID)) {
		return false
	}
	if row.MemberRole != "owner" && row.MemberRole != "member" && row.MemberRole != "moderator" {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, row.JoinedAt)
	return err == nil
}

func validGroupRow(row groupRow) bool {
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || !uuidPattern.MatchString(strings.ToLower(row.OwnerID)) {
		return false
	}
	if !utf8.ValidString(row.Name) || utf8.RuneCountInString(row.Name) < 2 || utf8.RuneCountInString(row.Name) > 80 || !validOptional(row.Description, 300) {
		return false
	}
	if row.AgeScope != "under14" && row.AgeScope != "14-17" && row.AgeScope != "18+" {
		return false
	}
	if !utf8.ValidString(row.JoinCode) || utf8.RuneCountInString(row.JoinCode) < 4 || utf8.RuneCountInString(row.JoinCode) > 32 || strings.ContainsAny(row.JoinCode, "\r\n\t ") {
		return false
	}
	if row.MaxMembers < 1 || row.MaxMembers > 100 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, row.CreatedAt)
	return err == nil
}

func validRow(row profileRow) bool {
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || row.Level < 1 || row.Level > 100 || row.XP < 0 || row.XP > 100_000_000 || row.RatingPoints < 0 || row.RatingPoints > 1_000_000_000 {
		return false
	}
	if row.AIScore != nil && (*row.AIScore < 0 || *row.AIScore > 100) {
		return false
	}
	if row.Username != nil && !usernamePattern.MatchString(*row.Username) {
		return false
	}
	if !validOptional(row.DisplayName, 120) || !validOptional(row.AvatarURL, 700) || !validOptional(row.SchoolName, 160) {
		return false
	}
	if row.Skills == nil || len(row.Skills) > 20 {
		return false
	}
	for _, skill := range row.Skills {
		if !utf8.ValidString(skill) || utf8.RuneCountInString(skill) > 80 {
			return false
		}
	}
	return true
}

func validOptional(value *string, maximum int) bool {
	return value == nil || (utf8.ValidString(*value) && utf8.RuneCountInString(*value) <= maximum)
}
