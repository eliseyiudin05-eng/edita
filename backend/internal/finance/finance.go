package finance

import (
	"context"
	"errors"
	"regexp"
)

var (
	ErrUnavailable  = errors.New("finance service unavailable")
	ErrNotFound     = errors.New("finance profile not found")
	ErrInsufficient = errors.New("insufficient earnings balance")
	ErrPending      = errors.New("active payout request exists")
)

const (
	MinimumPayoutCents int64 = 10_000
	MaximumPayoutCents int64 = 10_000_000_000
	TopupFeePercent          = 5
	WorkFeePercent           = 0
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Wallet struct {
	Available       int64 `json:"available"`
	Reserved        int64 `json:"reserved"`
	TopupFeePercent int   `json:"topupFeePercent"`
	WorkFeePercent  int   `json:"workFeePercent"`
}

type PayoutRequest struct {
	ID          string `json:"id"`
	AmountCents int64  `json:"amount_cents"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

type Payouts struct {
	Requests []PayoutRequest `json:"requests"`
}

type Store interface {
	GetWallet(context.Context, string, string) (Wallet, error)
	ListPayouts(context.Context, string, string) (Payouts, error)
	CreatePayout(context.Context, string, string, int64) error
}

func ValidPayoutAmount(amountCents int64) bool {
	return amountCents >= MinimumPayoutCents && amountCents <= MaximumPayoutCents
}
