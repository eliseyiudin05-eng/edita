package migrations

import "testing"

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
