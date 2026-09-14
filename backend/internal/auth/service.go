package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrEmailUnconfirmed   = errors.New("email is not confirmed")
	ErrEmailExists        = errors.New("email already exists")
)

type Service struct {
	db         *pgxpool.Pool
	issuer     string
	audience   string
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

type Registration struct {
	Email        string
	Password     string
	Role         string
	DisplayName  string
	Username     string
	Onboarding   json.RawMessage
	ReferralCode string
	BusinessName string
}

type Session struct {
	AccessToken  string    `json:"accessToken"`
	RefreshToken string    `json:"refreshToken"`
	ExpiresAt    time.Time `json:"expiresAt"`
	UserID       string    `json:"userId"`
	Role         string    `json:"role"`
}

type EmailChallenge struct {
	Email     string
	Token     string
	Purpose   string
	ExpiresAt time.Time
}

type localClaims struct {
	Subject   string `json:"sub"`
	Role      string `json:"role"`
	AppRole   string `json:"app_role"`
	SessionID string `json:"sid"`
	Issuer    string `json:"iss"`
	Audience  string `json:"aud"`
	IssuedAt  int64  `json:"iat"`
	NotBefore int64  `json:"nbf"`
	ExpiresAt int64  `json:"exp"`
}

func NewService(db *pgxpool.Pool, issuer, audience string, secret []byte, accessTTL, refreshTTL time.Duration) (*Service, error) {
	if db == nil || strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" || len(secret) < 32 {
		return nil, errors.New("local auth configuration is incomplete")
	}
	if accessTTL < time.Minute || accessTTL > time.Hour {
		return nil, errors.New("access token TTL must be between one minute and one hour")
	}
	if refreshTTL < time.Hour || refreshTTL > 90*24*time.Hour {
		return nil, errors.New("refresh token TTL must be between one hour and 90 days")
	}
	return &Service{db: db, issuer: issuer, audience: audience, secret: append([]byte(nil), secret...), accessTTL: accessTTL, refreshTTL: refreshTTL, now: time.Now}, nil
}

func (s *Service) Ready(ctx context.Context) error { return s.db.Ping(ctx) }

func (s *Service) Register(ctx context.Context, input Registration) (string, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	role := strings.ToLower(strings.TrimSpace(input.Role))
	if !validEmail(email) || len(input.Password) < 10 || len(input.Password) > 200 {
		return "", ErrInvalidCredentials
	}
	if role != "editor" && role != "business" && role != "creator" {
		return "", ErrInvalidCredentials
	}
	businessName := strings.TrimSpace(input.BusinessName)
	if (role == "business" || role == "creator") && (businessName == "" || len([]rune(businessName)) > 160) {
		return "", ErrInvalidCredentials
	}
	onboarding := input.Onboarding
	if len(onboarding) == 0 || !json.Valid(onboarding) {
		onboarding = json.RawMessage(`{}`)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin registration: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var userID string
	err = tx.QueryRow(ctx, `
		insert into public.app_users(email,password_hash,user_metadata)
		values($1,crypt($2,gen_salt('bf',12)),jsonb_build_object('role',$3,'display_name',$4,'onboarding',$5::jsonb))
		returning id`, email, input.Password, role, strings.TrimSpace(input.DisplayName), onboarding).Scan(&userID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return "", ErrEmailExists
		}
		return "", fmt.Errorf("create user: %w", err)
	}
	username := strings.TrimSpace(input.Username)
	if username == "" {
		username = role + "-" + strings.ReplaceAll(userID[:8], "-", "")
	}
	if _, err := tx.Exec(ctx, `
		insert into public.profiles(id,role,display_name,username,onboarding,referral_code)
		values($1,$2,nullif($3,''),$4,$5,upper(substr(encode(digest($1::text,'sha256'),'hex'),1,10)))`,
		userID, role, strings.TrimSpace(input.DisplayName), username, onboarding); err != nil {
		return "", fmt.Errorf("create profile: %w", err)
	}
	if role == "editor" && hasMotivation(onboarding) {
		command, err := tx.Exec(ctx, `
			insert into public.signup_reward_events(user_id,reason,points)
			values($1,'editor_motivation',5) on conflict(user_id) do nothing`, userID)
		if err != nil {
			return "", fmt.Errorf("create signup reward: %w", err)
		}
		if command.RowsAffected() == 1 {
			if _, err := tx.Exec(ctx, `update public.profiles set referral_points=referral_points+5 where id=$1`, userID); err != nil {
				return "", fmt.Errorf("credit signup reward: %w", err)
			}
		}
	}
	referralCode := strings.ToUpper(strings.TrimSpace(input.ReferralCode))
	if role == "editor" && referralCode != "" && len(referralCode) <= 16 {
		if _, err := tx.Exec(ctx, `
			insert into public.referrals(referrer_id,referred_id,referral_code,status)
			select id,$1,referral_code,'pending' from public.profiles
			where referral_code=$2 and id<>$1
			on conflict(referred_id) do nothing`, userID, referralCode); err != nil {
			return "", fmt.Errorf("create referral: %w", err)
		}
	}
	if role == "business" || role == "creator" {
		if _, err := tx.Exec(ctx, `insert into public.businesses(owner_id,name) values($1,$2) on conflict(owner_id) do update set name=excluded.name`, userID, businessName); err != nil {
			return "", fmt.Errorf("create business: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit registration: %w", err)
	}
	return userID, nil
}

func hasMotivation(onboarding json.RawMessage) bool {
	var payload struct {
		Motivation string `json:"motivation"`
	}
	return json.Unmarshal(onboarding, &payload) == nil && len([]rune(strings.TrimSpace(payload.Motivation))) >= 5
}

func (s *Service) Login(ctx context.Context, email, password, userAgent, ipAddress string) (Session, error) {
	if !validEmail(email) || password == "" || len(password) > 200 {
		return Session{}, ErrInvalidCredentials
	}
	var userID, role string
	var confirmed bool
	err := s.db.QueryRow(ctx, `
		select u.id::text,p.role,u.email_confirmed_at is not null
		from public.app_users u join public.profiles p on p.id=u.id
		where u.email=$1 and u.disabled_at is null and u.password_hash is not null
		  and u.password_hash=crypt($2,u.password_hash)`, strings.ToLower(strings.TrimSpace(email)), password).Scan(&userID, &role, &confirmed)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrInvalidCredentials
	}
	if err != nil {
		return Session{}, fmt.Errorf("authenticate user: %w", err)
	}
	if !confirmed {
		return Session{}, ErrEmailUnconfirmed
	}
	return s.createSession(ctx, userID, role, userAgent, ipAddress)
}

func (s *Service) Refresh(ctx context.Context, rawRefreshToken, userAgent, ipAddress string) (Session, error) {
	digest := sha256.Sum256([]byte(rawRefreshToken))
	newToken, newDigest, err := opaqueToken()
	if err != nil {
		return Session{}, err
	}
	now := s.now()
	var userID, role, sessionID string
	err = s.db.QueryRow(ctx, `
		update public.auth_sessions s set refresh_token_hash=$2,last_seen_at=$3,user_agent=$4,ip_address=nullif($5,'')::inet
		from public.profiles p
		where s.user_id=p.id and s.refresh_token_hash=$1 and s.revoked_at is null and s.expires_at>$3
		returning s.user_id::text,p.role,s.id::text`, digest[:], newDigest, now, bounded(userAgent, 500), ipAddress).Scan(&userID, &role, &sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrInvalidToken
	}
	if err != nil {
		return Session{}, fmt.Errorf("rotate session: %w", err)
	}
	access, expiresAt, err := s.sign(userID, role, sessionID)
	if err != nil {
		return Session{}, err
	}
	return Session{AccessToken: access, RefreshToken: newToken, ExpiresAt: expiresAt, UserID: userID, Role: role}, nil
}

func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	digest := sha256.Sum256([]byte(rawRefreshToken))
	_, err := s.db.Exec(ctx, "update public.auth_sessions set revoked_at=coalesce(revoked_at,$2) where refresh_token_hash=$1", digest[:], s.now())
	return err
}

func (s *Service) IssueEmailToken(ctx context.Context, email, purpose string) (EmailChallenge, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !validEmail(email) || (purpose != "confirm_email" && purpose != "recover_password") {
		return EmailChallenge{}, ErrInvalidCredentials
	}
	raw, digest, err := opaqueToken()
	if err != nil {
		return EmailChallenge{}, err
	}
	expiresAt := s.now().Add(time.Hour)
	command, err := s.db.Exec(ctx, `
		insert into public.auth_email_tokens(user_id,purpose,token_hash,email,expires_at)
		select id,$2,$3,email,$4 from public.app_users where email=$1 and disabled_at is null
		on conflict(token_hash) do nothing`, email, purpose, digest, expiresAt)
	if err != nil {
		return EmailChallenge{}, fmt.Errorf("create email challenge: %w", err)
	}
	if command.RowsAffected() == 0 {
		return EmailChallenge{}, nil
	}
	return EmailChallenge{Email: email, Token: raw, Purpose: purpose, ExpiresAt: expiresAt}, nil
}

func (s *Service) ConfirmEmail(ctx context.Context, rawToken string) error {
	digest := sha256.Sum256([]byte(rawToken))
	command, err := s.db.Exec(ctx, `
		with consumed as (
		  update public.auth_email_tokens set consumed_at=$2
		  where token_hash=$1 and purpose='confirm_email' and consumed_at is null and expires_at>$2
		  returning user_id
		)
		update public.app_users u set email_confirmed_at=coalesce(email_confirmed_at,$2),updated_at=$2
		from consumed where u.id=consumed.user_id`, digest[:], s.now())
	if err != nil {
		return fmt.Errorf("confirm email: %w", err)
	}
	if command.RowsAffected() != 1 {
		return ErrInvalidToken
	}
	return nil
}

func (s *Service) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	if len(newPassword) < 10 || len(newPassword) > 200 {
		return ErrInvalidCredentials
	}
	digest := sha256.Sum256([]byte(rawToken))
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin password reset: %w", err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var userID string
	err = tx.QueryRow(ctx, `
		update public.auth_email_tokens set consumed_at=$2
		where token_hash=$1 and purpose='recover_password' and consumed_at is null and expires_at>$2
		returning user_id::text`, digest[:], s.now()).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return fmt.Errorf("consume password reset: %w", err)
	}
	if _, err := tx.Exec(ctx, `update public.app_users set password_hash=crypt($2,gen_salt('bf',12)),updated_at=$3 where id=$1`, userID, newPassword, s.now()); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if _, err := tx.Exec(ctx, "update public.auth_sessions set revoked_at=coalesce(revoked_at,$2) where user_id=$1", userID, s.now()); err != nil {
		return fmt.Errorf("revoke sessions after password reset: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Service) Verify(ctx context.Context, rawToken string) (Claims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 || len(rawToken) > 8192 {
		return Claims{}, ErrInvalidToken
	}
	expected := hmac.New(sha256.New, s.secret)
	_, _ = expected.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, expected.Sum(nil)) {
		return Claims{}, ErrInvalidToken
	}
	var claims localClaims
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(payload, &claims) != nil {
		return Claims{}, ErrInvalidToken
	}
	now := s.now()
	if claims.Subject == "" || claims.SessionID == "" || claims.Role != "authenticated" || claims.Issuer != s.issuer || claims.Audience != s.audience ||
		!now.Before(time.Unix(claims.ExpiresAt, 0)) || now.Add(30*time.Second).Before(time.Unix(claims.NotBefore, 0)) {
		return Claims{}, ErrInvalidToken
	}
	var active bool
	err = s.db.QueryRow(ctx, `select exists(
		select 1 from public.auth_sessions where id=$1 and user_id=$2 and revoked_at is null and expires_at>$3
	)`, claims.SessionID, claims.Subject, now).Scan(&active)
	if err != nil {
		return Claims{}, ErrVerificationService
	}
	if !active {
		return Claims{}, ErrInvalidToken
	}
	return Claims{Subject: claims.Subject, Role: claims.Role, Issuer: claims.Issuer, Audience: []string{claims.Audience}, Expiry: time.Unix(claims.ExpiresAt, 0)}, nil
}

func (s *Service) createSession(ctx context.Context, userID, role, userAgent, ipAddress string) (Session, error) {
	refreshToken, digest, err := opaqueToken()
	if err != nil {
		return Session{}, err
	}
	now := s.now()
	refreshExpiry := now.Add(s.refreshTTL)
	var sessionID string
	err = s.db.QueryRow(ctx, `
		insert into public.auth_sessions(user_id,refresh_token_hash,user_agent,ip_address,expires_at)
		values($1,$2,$3,nullif($4,'')::inet,$5) returning id::text`,
		userID, digest, bounded(userAgent, 500), ipAddress, refreshExpiry).Scan(&sessionID)
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	accessToken, accessExpiry, err := s.sign(userID, role, sessionID)
	if err != nil {
		return Session{}, err
	}
	_, _ = s.db.Exec(ctx, "update public.app_users set last_sign_in_at=$2,updated_at=$2 where id=$1", userID, now)
	return Session{AccessToken: accessToken, RefreshToken: refreshToken, ExpiresAt: accessExpiry, UserID: userID, Role: role}, nil
}

func (s *Service) sign(userID, role, sessionID string) (string, time.Time, error) {
	now := s.now()
	expiresAt := now.Add(s.accessTTL)
	header, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload, err := json.Marshal(localClaims{Subject: userID, Role: "authenticated", AppRole: role, SessionID: sessionID, Issuer: s.issuer, Audience: s.audience, IssuedAt: now.Unix(), NotBefore: now.Add(-5 * time.Second).Unix(), ExpiresAt: expiresAt.Unix()})
	if err != nil {
		return "", time.Time{}, err
	}
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), expiresAt, nil
}

func opaqueToken() (string, []byte, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", nil, fmt.Errorf("generate token: %w", err)
	}
	raw := base64.RawURLEncoding.EncodeToString(value)
	digest := sha256.Sum256([]byte(raw))
	return raw, digest[:], nil
}

func validEmail(value string) bool {
	value = strings.TrimSpace(value)
	at := strings.LastIndexByte(value, '@')
	return len(value) <= 320 && at > 0 && at < len(value)-3 && strings.Contains(value[at+1:], ".") && !strings.ContainsAny(value, "\r\n\t ")
}

func bounded(value string, maximum int) string {
	value = strings.TrimSpace(value)
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}
