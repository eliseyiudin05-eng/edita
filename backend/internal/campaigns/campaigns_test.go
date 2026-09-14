package campaigns

import "testing"

func TestNormalizeCreateBoundsCampaignContract(t *testing.T) {
	input, err := NormalizeCreate(CreateInput{Title: "Запуск продукта", Goal: "Сделать серию роликов", BudgetText: "5000 RUB", CreatorSlots: 3, ContentTypes: []string{" Reels ", "Отзывы"}})
	if err != nil || input.ContentTypes[0] != "Reels" || input.CreatorSlots != 3 {
		t.Fatalf("unexpected input: %+v error=%v", input, err)
	}
	for _, invalid := range []CreateInput{
		{Title: "x", Goal: "goal", BudgetText: "pay", CreatorSlots: 1},
		{Title: "title", Goal: "x", BudgetText: "pay", CreatorSlots: 1},
		{Title: "title", Goal: "goal", BudgetText: "", CreatorSlots: 1},
		{Title: "title", Goal: "goal", BudgetText: "pay", CreatorSlots: 101},
	} {
		if _, err := NormalizeCreate(invalid); err == nil {
			t.Fatalf("invalid campaign accepted: %+v", invalid)
		}
	}
}

func TestNormalizeApplyRequiresHTTPSPortfolio(t *testing.T) {
	valid, err := NormalizeApply(ApplyInput{CampaignID: "00000000-0000-4000-8000-000000000010", PortfolioURL: " https://portfolio.example/work ", Note: " Готов начать "})
	if err != nil || valid.Note != "Готов начать" {
		t.Fatalf("unexpected application: %+v error=%v", valid, err)
	}
	for _, value := range []string{"http://portfolio.example", "javascript:alert(1)", "https://user:pass@example.com"} {
		if _, err := NormalizeApply(ApplyInput{CampaignID: valid.CampaignID, PortfolioURL: value}); err == nil {
			t.Fatalf("unsafe portfolio URL accepted: %q", value)
		}
	}
}

func TestApplicationStatusesAreExplicit(t *testing.T) {
	for _, value := range []string{"shortlisted", "accepted", "declined"} {
		if !ValidStatus(value) {
			t.Fatalf("valid status rejected: %s", value)
		}
	}
	if ValidStatus("winner") || ValidStatus("applied") {
		t.Fatal("client-controlled status accepted")
	}
}
