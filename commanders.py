import requests
import json
import time
from pathlib import Path

url = "https://api.scryfall.com/cards/search?q=is%3Acommander"
# Scryfall rejects the default python-requests User-Agent
headers = {
    "User-Agent": "EDHRankle/1.0 (https://edhrankle.com)",
    "Accept": "application/json",
}
# The app imports src/commanders.json, regardless of where this script is run from
output = Path(__file__).resolve().parent / "src" / "commanders.json"
all_cards = []

while url:
    print(f"Fetching: {url}")
    response = requests.get(url, headers=headers, timeout=30)
    if not response.ok:
        raise SystemExit(f"Scryfall request failed ({response.status_code}): {response.text}")
    data = response.json()
    all_cards.extend(data["data"])
    url = data.get("next_page")
    time.sleep(0.5)  # Scryfall limits /cards/search to 2 requests per second

with open(output, "w", encoding="utf-8") as f:
    json.dump(all_cards, f, ensure_ascii=False, indent=2)

print(f"Saved {len(all_cards)} commanders to {output}")
