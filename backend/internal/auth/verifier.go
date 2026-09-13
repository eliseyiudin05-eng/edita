package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidToken        = errors.New("invalid access token")
	ErrVerificationService = errors.New("token verification service unavailable")
)

type Claims struct {
	Subject  string
	Role     string
	Issuer   string
	Audience []string
	Expiry   time.Time
}

type Verifier struct {
	issuer   string
	audience string
	jwksURL  string
	client   *http.Client
	cacheTTL time.Duration
	now      func() time.Time

	mu        sync.RWMutex
	keys      map[string]verificationKey
	fetchedAt time.Time
}

type verificationKey struct {
	algorithm string
	key       crypto.PublicKey
}

type tokenHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type tokenClaims struct {
	Subject   string          `json:"sub"`
	Role      string          `json:"role"`
	Issuer    string          `json:"iss"`
	Audience  json.RawMessage `json:"aud"`
	ExpiresAt int64           `json:"exp"`
	NotBefore int64           `json:"nbf"`
}

type jwksDocument struct {
	Keys []json.RawMessage `json:"keys"`
}

type jwk struct {
	KeyID     string `json:"kid"`
	KeyType   string `json:"kty"`
	Use       string `json:"use"`
	Algorithm string `json:"alg"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
	Curve     string `json:"crv"`
	X         string `json:"x"`
	Y         string `json:"y"`
}

func NewVerifier(issuer, audience, jwksURL string, client *http.Client, cacheTTL time.Duration) (*Verifier, error) {
	if strings.TrimSpace(issuer) == "" || strings.TrimSpace(audience) == "" || strings.TrimSpace(jwksURL) == "" {
		return nil, errors.New("JWT verifier configuration is incomplete")
	}
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	if cacheTTL <= 0 || cacheTTL > 10*time.Minute {
		cacheTTL = 5 * time.Minute
	}
	return &Verifier{
		issuer: issuer, audience: audience, jwksURL: jwksURL,
		client: client, cacheTTL: cacheTTL, now: time.Now,
		keys: make(map[string]verificationKey),
	}, nil
}

func (v *Verifier) Verify(ctx context.Context, rawToken string) (Claims, error) {
	parts := strings.Split(rawToken, ".")
	if len(parts) != 3 || len(rawToken) > 16*1024 {
		return Claims{}, ErrInvalidToken
	}

	headerBytes, err := decodeSegment(parts[0], 2048)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var header tokenHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.KeyID == "" || (header.Algorithm != "RS256" && header.Algorithm != "ES256") {
		return Claims{}, ErrInvalidToken
	}

	key, err := v.key(ctx, header.KeyID)
	if err != nil {
		return Claims{}, err
	}
	if key.algorithm != "" && key.algorithm != header.Algorithm {
		return Claims{}, ErrInvalidToken
	}

	signature, err := decodeSegment(parts[2], 1024)
	if err != nil || !verifySignature(header.Algorithm, key.key, []byte(parts[0]+"."+parts[1]), signature) {
		return Claims{}, ErrInvalidToken
	}

	claimsBytes, err := decodeSegment(parts[1], 12*1024)
	if err != nil {
		return Claims{}, ErrInvalidToken
	}
	var rawClaims tokenClaims
	if err := json.Unmarshal(claimsBytes, &rawClaims); err != nil {
		return Claims{}, ErrInvalidToken
	}
	audience, err := parseAudience(rawClaims.Audience)
	if err != nil || rawClaims.Subject == "" || rawClaims.Issuer != v.issuer || !contains(audience, v.audience) || rawClaims.ExpiresAt == 0 {
		return Claims{}, ErrInvalidToken
	}

	now := v.now()
	const clockSkew = 30 * time.Second
	expiry := time.Unix(rawClaims.ExpiresAt, 0)
	if !now.Before(expiry.Add(clockSkew)) {
		return Claims{}, ErrInvalidToken
	}
	if rawClaims.NotBefore != 0 && now.Add(clockSkew).Before(time.Unix(rawClaims.NotBefore, 0)) {
		return Claims{}, ErrInvalidToken
	}

	return Claims{Subject: rawClaims.Subject, Role: rawClaims.Role, Issuer: rawClaims.Issuer, Audience: audience, Expiry: expiry}, nil
}

func (v *Verifier) Ready(ctx context.Context) error {
	v.mu.RLock()
	keyCount := len(v.keys)
	age := v.now().Sub(v.fetchedAt)
	v.mu.RUnlock()
	if keyCount > 0 && age >= 0 && age < v.cacheTTL {
		return nil
	}
	if err := v.refresh(ctx); err != nil {
		return ErrVerificationService
	}
	return nil
}

func (v *Verifier) key(ctx context.Context, keyID string) (verificationKey, error) {
	v.mu.RLock()
	key, found := v.keys[keyID]
	age := v.now().Sub(v.fetchedAt)
	fresh := age >= 0 && age < v.cacheTTL
	v.mu.RUnlock()
	if fresh {
		if found {
			return key, nil
		}
		return verificationKey{}, ErrInvalidToken
	}

	if err := v.refresh(ctx); err != nil {
		return verificationKey{}, ErrVerificationService
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	key, found = v.keys[keyID]
	if !found {
		return verificationKey{}, ErrInvalidToken
	}
	return key, nil
}

func (v *Verifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	response, err := v.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return fmt.Errorf("JWKS returned status %d", response.StatusCode)
	}

	decoder := json.NewDecoder(io.LimitReader(response.Body, 256*1024))
	var document jwksDocument
	if err := decoder.Decode(&document); err != nil || len(document.Keys) == 0 || len(document.Keys) > 20 {
		return errors.New("invalid JWKS document")
	}

	keys := make(map[string]verificationKey, len(document.Keys))
	for _, rawKey := range document.Keys {
		var value jwk
		if err := json.Unmarshal(rawKey, &value); err != nil || value.KeyID == "" || (value.Use != "" && value.Use != "sig") {
			continue
		}
		publicKey, err := parsePublicKey(value)
		if err != nil {
			continue
		}
		keys[value.KeyID] = verificationKey{algorithm: value.Algorithm, key: publicKey}
	}
	if len(keys) == 0 {
		return errors.New("JWKS has no supported signing keys")
	}

	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = v.now()
	v.mu.Unlock()
	return nil
}

func parsePublicKey(value jwk) (crypto.PublicKey, error) {
	switch value.KeyType {
	case "RSA":
		if value.Algorithm != "" && value.Algorithm != "RS256" {
			return nil, errors.New("unsupported RSA algorithm")
		}
		modulus, err := base64.RawURLEncoding.DecodeString(value.Modulus)
		if err != nil || len(modulus) < 256 {
			return nil, errors.New("invalid RSA modulus")
		}
		exponentBytes, err := base64.RawURLEncoding.DecodeString(value.Exponent)
		if err != nil || len(exponentBytes) == 0 || len(exponentBytes) > 4 {
			return nil, errors.New("invalid RSA exponent")
		}
		exponent := 0
		for _, b := range exponentBytes {
			exponent = exponent<<8 | int(b)
		}
		if exponent < 3 || exponent%2 == 0 {
			return nil, errors.New("invalid RSA exponent")
		}
		return &rsa.PublicKey{N: new(big.Int).SetBytes(modulus), E: exponent}, nil
	case "EC":
		if value.Curve != "P-256" || (value.Algorithm != "" && value.Algorithm != "ES256") {
			return nil, errors.New("unsupported EC key")
		}
		x, errX := base64.RawURLEncoding.DecodeString(value.X)
		y, errY := base64.RawURLEncoding.DecodeString(value.Y)
		if errX != nil || errY != nil || len(x) != 32 || len(y) != 32 {
			return nil, errors.New("invalid EC coordinates")
		}
		encodedPoint := make([]byte, 1+len(x)+len(y))
		encodedPoint[0] = 4
		copy(encodedPoint[1:], x)
		copy(encodedPoint[1+len(x):], y)
		publicKey, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), encodedPoint)
		if err != nil {
			return nil, errors.New("invalid EC public key")
		}
		return publicKey, nil
	default:
		return nil, errors.New("unsupported key type")
	}
}

func verifySignature(algorithm string, key crypto.PublicKey, signingInput, signature []byte) bool {
	digest := sha256.Sum256(signingInput)
	switch algorithm {
	case "RS256":
		publicKey, ok := key.(*rsa.PublicKey)
		return ok && rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, digest[:], signature) == nil
	case "ES256":
		publicKey, ok := key.(*ecdsa.PublicKey)
		if !ok || len(signature) != 64 {
			return false
		}
		return ecdsa.Verify(publicKey, digest[:], new(big.Int).SetBytes(signature[:32]), new(big.Int).SetBytes(signature[32:]))
	default:
		return false
	}
}

func decodeSegment(segment string, maximum int) ([]byte, error) {
	if segment == "" || len(segment) > maximum*2 {
		return nil, errors.New("invalid JWT segment")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil || len(decoded) > maximum {
		return nil, errors.New("invalid JWT segment")
	}
	return decoded, nil
}

func parseAudience(raw json.RawMessage) ([]string, error) {
	var single string
	if err := json.Unmarshal(raw, &single); err == nil && single != "" {
		return []string{single}, nil
	}
	var multiple []string
	if err := json.Unmarshal(raw, &multiple); err != nil || len(multiple) == 0 || len(multiple) > 10 {
		return nil, errors.New("invalid audience")
	}
	for _, value := range multiple {
		if value == "" {
			return nil, errors.New("invalid audience")
		}
	}
	return multiple, nil
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
