package rewards

import "testing"

func TestAvailableRewardsAreStableAndValid(t *testing.T) {
	items := AvailableRewards()
	if len(items) != 1 || items[0].ID != CreatorPlus30 || items[0].Cost != CreatorPlusCost || !ValidReward(items[0].ID) {
		t.Fatalf("unexpected rewards: %+v", items)
	}
	if ValidReward("creator_plus_forever") {
		t.Fatal("unknown reward was accepted")
	}
}
