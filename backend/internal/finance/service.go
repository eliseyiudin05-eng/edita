package finance

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

type Service struct {
	repository Store
	provider   PaymentProvider
	returnURL  string
}

func NewService(repository Store, provider PaymentProvider, returnURL string) (*Service, error) {
	parsed, err := url.Parse(strings.TrimSpace(returnURL))
	if err != nil || parsed == nil {
		return nil, errors.New("finance service configuration is invalid")
	}
	localHTTP := parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1")
	if repository == nil || (parsed.Scheme != "https" && !localHTTP) || parsed.Host == "" || parsed.User != nil {
		return nil, errors.New("finance service configuration is invalid")
	}
	return &Service{repository: repository, provider: provider, returnURL: parsed.String()}, nil
}

func (s *Service) GetWallet(ctx context.Context, token, subject string) (Wallet, error) {
	return s.repository.GetWallet(ctx, token, subject)
}

func (s *Service) ListPayouts(ctx context.Context, token, subject string) (Payouts, error) {
	return s.repository.ListPayouts(ctx, token, subject)
}

func (s *Service) CreatePayout(ctx context.Context, token, subject string, amountCents int64) error {
	return s.repository.CreatePayout(ctx, token, subject, amountCents)
}

func (s *Service) StartTopup(ctx context.Context, subject string, input TopupInput) (TopupResponse, error) {
	if s == nil || !uuidPattern.MatchString(strings.ToLower(strings.TrimSpace(subject))) || !ValidTopup(input) {
		return TopupResponse{}, ErrUnavailable
	}
	if s.provider == nil {
		return TopupResponse{}, ErrProvider
	}
	record, err := s.repository.BeginTopup(ctx, subject, input)
	if err != nil {
		return TopupResponse{}, err
	}
	if record.ConfirmationURL != nil && strings.HasPrefix(*record.ConfirmationURL, "https://") {
		return TopupResponse{URL: *record.ConfirmationURL}, nil
	}
	payment, err := s.provider.CreatePayment(ctx, record, s.returnURL)
	if err != nil {
		return TopupResponse{}, ErrProvider
	}
	if payment.Currency != "RUB" || payment.AmountCents != record.AmountCents || payment.Metadata["topup_id"] != record.ID || payment.Metadata["points"] != strconv.FormatInt(record.Points, 10) || !strings.HasPrefix(payment.ConfirmationURL, "https://") {
		return TopupResponse{}, ErrConflict
	}
	record, err = s.repository.AttachTopupPayment(ctx, record.ID, payment)
	if err != nil || record.ConfirmationURL == nil {
		return TopupResponse{}, err
	}
	return TopupResponse{URL: *record.ConfirmationURL}, nil
}

func (s *Service) HandlePaymentWebhook(ctx context.Context, paymentID string) error {
	if s == nil || s.provider == nil {
		return ErrProvider
	}
	payment, err := s.provider.GetPayment(ctx, paymentID)
	if err != nil {
		return ErrProvider
	}
	if payment.Status != "succeeded" {
		return nil
	}
	if payment.Currency != "RUB" || payment.Metadata["topup_id"] == "" {
		return ErrConflict
	}
	points, err := strconv.ParseInt(payment.Metadata["points"], 10, 64)
	if err != nil || points < 100 || points > 1_000_000 || payment.AmountCents != points*105 {
		return ErrConflict
	}
	return s.repository.CreditTopup(ctx, payment)
}
