package finance

import "testing"

func TestValidPayoutAmount(t *testing.T) {
	for _, test := range []struct {
		amount int64
		valid  bool
	}{{9_999, false}, {10_000, true}, {10_000_000_000, true}, {10_000_000_001, false}} {
		if got := ValidPayoutAmount(test.amount); got != test.valid {
			t.Fatalf("ValidPayoutAmount(%d) = %v, want %v", test.amount, got, test.valid)
		}
	}
}
