package rewards

import (
	"context"
	"errors"
	"regexp"
)

var (
	ErrUnavailable  = errors.New("rewards service unavailable")
	ErrNotFound     = errors.New("rewards profile not found")
	ErrForbidden    = errors.New("reward is not available for this account")
	ErrInsufficient = errors.New("not enough reward points")
	ErrUnknown      = errors.New("unknown reward")
)

const (
	CreatorPlus30   = "creator_plus_30"
	CreatorPlusCost = int64(500)
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Reward struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Cost        int64  `json:"cost"`
	Description string `json:"description"`
}

type Redemption struct {
	ID          string `json:"id"`
	PointsSpent int64  `json:"points_spent"`
	Reward      string `json:"reward"`
	CreatedAt   string `json:"created_at"`
}

type Dashboard struct {
	Code              *string      `json:"code"`
	Points            int64        `json:"points"`
	Qualified         int64        `json:"qualified"`
	Pending           int64        `json:"pending"`
	Rewards           []Reward     `json:"rewards"`
	Redemptions       []Redemption `json:"redemptions"`
	RedemptionEnabled bool         `json:"redemptionEnabled"`
}

type Qualification struct {
	OK        bool   `json:"ok"`
	Qualified bool   `json:"qualified"`
	Reason    string `json:"reason,omitempty"`
	Completed int64  `json:"completed,omitempty"`
}

type RedemptionResult struct {
	OK            bool   `json:"ok"`
	Reward        string `json:"reward"`
	PlanExpiresAt string `json:"planExpiresAt"`
}

type Store interface {
	GetDashboard(context.Context, string, string, bool) (Dashboard, error)
	QualifyReferral(context.Context, string, string) (Qualification, error)
	Redeem(context.Context, string, string, string) (RedemptionResult, error)
}

func AvailableRewards() []Reward {
	return []Reward{{
		ID: CreatorPlus30, Name: "Creator+ на 30 дней", Cost: CreatorPlusCost,
		Description: "Расширенные инструменты монтажёра после запуска платных планов.",
	}}
}

func ValidReward(value string) bool { return value == CreatorPlus30 }
