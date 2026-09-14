package migrations

import (
	"strings"
	"testing"
)

func TestEmbeddedMigrationsAreOrderedAndUnique(t *testing.T) {
	items, err := load()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) == 0 {
		t.Fatal("expected embedded migrations")
	}
	for index := 1; index < len(items); index++ {
		if items[index-1].version >= items[index].version {
			t.Fatalf("migrations are not strictly ordered: %s then %s", items[index-1].version, items[index].version)
		}
	}
}

func TestChallengeMigrationProtectsWinnerContract(t *testing.T) {
	items, err := load()
	if err != nil {
		t.Fatal(err)
	}
	var sql string
	for _, item := range items {
		if item.version == "000015" {
			sql = item.sql
			break
		}
	}
	if sql == "" {
		t.Fatal("challenge migration was not embedded")
	}
	for _, required := range []string{
		"challenge_submissions_one_winner_idx",
		"portfolio_items_source_unique_idx",
		"protect_challenge_rewards",
		"object_id uuid references public.objects",
	} {
		if !strings.Contains(sql, required) {
			t.Fatalf("challenge migration is missing %q", required)
		}
	}
}

func TestPortfolioMigrationProtectsPublicContract(t *testing.T) {
	items, err := load()
	if err != nil {
		t.Fatal(err)
	}
	var sql string
	for _, item := range items {
		if item.version == "000016" {
			sql = item.sql
			break
		}
	}
	if sql == "" {
		t.Fatal("portfolio migration was not embedded")
	}
	for _, required := range []string{
		"portfolio_items_editor_created_idx",
		"portfolio_items_object_idx",
		"cardinality(tags)<=12",
		"object_id uuid references public.objects",
	} {
		if !strings.Contains(sql, required) {
			t.Fatalf("portfolio migration is missing %q", required)
		}
	}
}
