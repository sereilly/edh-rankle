import requests
import json

url = "https://api.scryfall.com/cards/search?q=is%3Acommander"
all_cards = []

while url:
    print(f"Fetching: {url}")
    response = requests.get(url)
    data = response.json()
    all_cards.extend(data["data"])
    url = data.get("next_page")

with open("commanders.json", "w", encoding="utf-8") as f:
    json.dump(all_cards, f, ensure_ascii=False, indent=2)

print(f"Saved {len(all_cards)} commanders to commanders.json")