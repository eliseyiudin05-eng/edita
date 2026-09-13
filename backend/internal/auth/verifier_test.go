package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestVerifierAcceptsValidSupabaseTokenAndCachesJWKS(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{rsaJWK("primary", &privateKey.PublicKey)}})
	}))
	defer server.Close()

	now := time.Unix(1_800_000_000, 0)
	verifier, err := NewVerifier("https://project.supabase.co/auth/v1", "authenticated", server.URL, server.Client(), 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	verifier.now = func() time.Time { return now }
	token := signedToken(t, privateKey, "primary", map[string]any{
		"sub": "user-id", "role": "authenticated", "iss": verifier.issuer,
		"aud": "authenticated", "exp": now.Add(time.Minute).Unix(),
	})

	for range 2 {
		claims, verifyErr := verifier.Verify(context.Background(), token)
		if verifyErr != nil {
			t.Fatalf("Verify() error = %v", verifyErr)
		}
		if claims.Subject != "user-id" || claims.Role != "authenticated" {
			t.Fatalf("unexpected claims: %+v", claims)
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("JWKS requests = %d, want 1", requests.Load())
	}
}

func TestVerifierRejectsWrongAudienceAndExpiredToken(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{rsaJWK("primary", &privateKey.PublicKey)}})
	}))
	defer server.Close()

	now := time.Unix(1_800_000_000, 0)
	verifier, _ := NewVerifier("https://project.supabase.co/auth/v1", "authenticated", server.URL, server.Client(), 5*time.Minute)
	verifier.now = func() time.Time { return now }

	tests := []map[string]any{
		{"sub": "user-id", "iss": verifier.issuer, "aud": "other", "exp": now.Add(time.Minute).Unix()},
		{"sub": "user-id", "iss": verifier.issuer, "aud": "authenticated", "exp": now.Add(-time.Minute).Unix()},
	}
	for index, claims := range tests {
		token := signedToken(t, privateKey, "primary", claims)
		if _, verifyErr := verifier.Verify(context.Background(), token); verifyErr != ErrInvalidToken {
			t.Fatalf("case %d: Verify() error = %v, want ErrInvalidToken", index, verifyErr)
		}
	}
}

func TestVerifierDoesNotRefetchFreshJWKSForUnknownKey(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{rsaJWK("primary", &privateKey.PublicKey)}})
	}))
	defer server.Close()

	verifier, _ := NewVerifier("https://project.supabase.co/auth/v1", "authenticated", server.URL, server.Client(), 5*time.Minute)
	verifier.now = func() time.Time { return time.Unix(1_800_000_000, 0) }
	valid := signedToken(t, privateKey, "primary", map[string]any{"sub": "user-id", "iss": verifier.issuer, "aud": "authenticated", "exp": int64(1_800_000_100)})
	unknown := signedToken(t, privateKey, "unknown", map[string]any{"sub": "user-id", "iss": verifier.issuer, "aud": "authenticated", "exp": int64(1_800_000_100)})

	_, _ = verifier.Verify(context.Background(), valid)
	_, _ = verifier.Verify(context.Background(), unknown)
	if requests.Load() != 1 {
		t.Fatalf("JWKS requests = %d, want 1", requests.Load())
	}
}

func rsaJWK(keyID string, publicKey *rsa.PublicKey) map[string]string {
	exponent := big.NewInt(int64(publicKey.E)).Bytes()
	return map[string]string{
		"kid": keyID, "kty": "RSA", "use": "sig", "alg": "RS256",
		"n": base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(exponent),
	}
}

func signedToken(t *testing.T, key *rsa.PrivateKey, keyID string, claims map[string]any) string {
	t.Helper()
	header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": keyID, "typ": "JWT"})
	payload, _ := json.Marshal(claims)
	encodedHeader := base64.RawURLEncoding.EncodeToString(header)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	signingInput := encodedHeader + "." + encodedPayload
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}
