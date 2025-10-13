import React, {useEffect, useState, useCallback} from "react";
// Helper: fetch a random commander card from Scryfall
async function fetchRandomCommanderFromScryfall() {
  // Scryfall random endpoint with commander filter
  const url = "https://api.scryfall.com/cards/random?q=is%3Acommander";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Scryfall random commander fetch failed");
  const card = await res.json();
  // Return card details and images
  return {
    name: card.name,
    set_name: card.set_name,
    art: card.image_uris?.art_crop || null,
    cardImage: card.image_uris?.large || null,
    scryfall: card,
    cmc: card.cmc,
    power: card.power,
    toughness: card.toughness,
    oracle_text: card.oracle_text,
  };
}

// EDHREC Commander Rank Guessing Game
// Single-file React component. Default export at bottom.
// Tailwind CSS assumed available in the host project.

// Behavior summary (how it works):
// 1. Fetch a JSON list of commanders from EDHREC's unofficial JSON pages endpoints.
// 2. Pick two distinct random commanders and fetch their card art from Scryfall.
// 3. Show both full-art images to the user. User guesses which has a higher (better) rank.
//    - EDHREC ranks: lower number is "higher" (Rank #1 is the top commander).
// 4. When guess is made, reveal ranks and update streak. Wrong guess resets streak to 0.

// NOTE: This component uses two external sources at runtime:
// - EDHREC JSON endpoint(s) (unofficial): e.g. https://json.edhrec.com/pages/commanders/year.json
// - Scryfall API for card images: https://api.scryfall.com/cards/named?exact=...
// Both are public but not guaranteed. The component includes basic fallbacks.

const EDHREC_COMMANDERS_LIST_URLS = [
  // Try these in order until one works
  "https://json.edhrec.com/pages/commanders/year.json",
  "https://json.edhrec.com/pages/commanders/year-past2years-1.json",
  "https://json.edhrec.com/pages/commanders/month.json",
  "https://json.edhrec.com/pages/commanders/week.json",
];

function useCommandersList() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function tryFetch() {
      setLoading(true);
      setError(null);
      for (const url of EDHREC_COMMANDERS_LIST_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const j = await res.json();
          // The JSON structure varies; try to extract slugs/names and ranks.
          // Many pages return an array 'items' or 'commanders' or 'panels'. We'll attempt a few heuristics.

          const commanders = extractCommandersFromEdhrecPage(j);
          if (commanders && commanders.length > 10) {
            if (!cancelled) {
              setList(commanders);
              setLoading(false);
            }
            return;
          }
        } catch (e) {
          // try next URL
        }
      }
      if (!cancelled) {
        setError("Failed to fetch commanders list from EDHREC JSON endpoints.");
        setLoading(false);
      }
    }
    tryFetch();
    return () => (cancelled = true);
  }, []);

  return {list, loading, error};
}

function extractCommandersFromEdhrecPage(json) {
  // Heuristics to extract commander list with their slug/name and rank if available.
  // Updated to handle EDHREC JSON with cardlists[0].cardviews[] structure.
  try {
    // EDHREC main commander list: json.container.json_dict.cardlists[0].cardviews[]
    if (
      json.container &&
      json.container.json_dict &&
      Array.isArray(json.container.json_dict.cardlists)
      && json.container.json_dict.cardlists[0]
      && Array.isArray(json.container.json_dict.cardlists[0].cardviews)
    ) {
      const arr = json.container.json_dict.cardlists[0].cardviews.map((c) => {
        // Use sanitized (slug), name, rank, num_decks
        return {
          slug: c.sanitized || c.sanitized_wo || slugify(c.name),
          name: c.name,
          rank: typeof c.rank === 'number' ? c.rank : (c.rank ? Number(c.rank) : undefined),
          num_decks: typeof c.num_decks === 'number' ? c.num_decks : (c.inclusion ? Number(c.inclusion) : undefined),
        };
      });
      if (arr.length) return arr;
    }

    // Fallbacks for other formats (legacy heuristics)
    if (Array.isArray(json)) {
      const arr = json
        .map((it) => {
          if (typeof it === "string") return { slug: it, name: it };
          if (it.slug || it.url || it.name) {
            return { slug: it.slug || it.url || it.name, name: it.name || it.slug || it.url };
          }
          return null;
        })
        .filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.items && Array.isArray(json.items)) {
      const arr = json.items.map((it) => {
        if (typeof it === "string") return { slug: it, name: it };
        if (it.slug || it.url || it.name) {
          return { slug: it.slug || it.url || it.name, name: it.name || it.slug || it.url };
        }
        if (it.title) return { slug: slugify(it.title), name: it.title };
        return null;
      }).filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.commanders && Array.isArray(json.commanders)) {
      const arr = json.commanders.map((c) => {
        if (typeof c === "string") return { slug: slugify(c), name: c };
        if (c.name) return { slug: slugify(c.name), name: c.name };
        return null;
      }).filter(Boolean);
      if (arr.length) return arr;
    }

    if (json.panels && json.panels.commanders && Array.isArray(json.panels.commanders)) {
      return json.panels.commanders.map((c) => ({ slug: c, name: c }));
    }
  } catch (e) {
    return null;
  }
  return null;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/["'!\?\(\):,\.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchScryfallArtForName(name) {
  // Use Scryfall named endpoint. If double-faced, pick first face art.
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Scryfall fetch failed");
  const j = await res.json();
  // Prefer art_crop when available; otherwise use large or normal.
  const getArt = (card) => {
    if (card.image_uris && card.image_uris.art_crop) return card.image_uris.art_crop;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.art_crop)
      return card.card_faces[0].image_uris.art_crop;
    if (card.image_uris && card.image_uris.large) return card.image_uris.large;
    if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.large)
      return card.card_faces[0].image_uris.large;
    // Last resort use svg or png
    if (card.image_uris && card.image_uris.png) return card.image_uris.png;
    return null;
  };
  const art = getArt(j);
  return { art, scryfall: j };
}

function pickTwoDistinct(arr) {
  if (!arr || arr.length < 2) return null;
  const a = Math.floor(Math.random() * arr.length);
  let b = Math.floor(Math.random() * (arr.length - 1));
  if (b >= a) b += 1;
  return [arr[a], arr[b]];
}

export default function CommanderGuessGame() {
  // State for two random Scryfall commanders
  const [leftMeta, setLeftMeta] = useState(null);
  const [rightMeta, setRightMeta] = useState(null);
  const [streak, setStreak] = useState(0);
  const [result, setResult] = useState(null); // 'left' | 'right' | 'tie' | null
  const [loadingPair, setLoadingPair] = useState(false);

  // Fetch two distinct random commanders from Scryfall
  const loadNewPair = useCallback(async () => {
    setResult(null);
    setLeftMeta(null);
    setRightMeta(null);
    setLoadingPair(true);
    try {
      let left, right;
      // Try to get two distinct commanders
      left = await fetchRandomCommanderFromScryfall();
      do {
        right = await fetchRandomCommanderFromScryfall();
      } while (right.name === left.name);
      setLeftMeta(left);
      setRightMeta(right);
    } catch (e) {
      setLeftMeta({ error: "Failed to fetch commander from Scryfall." });
      setRightMeta({ error: "Failed to fetch commander from Scryfall." });
    } finally {
      setLoadingPair(false);
    }
  }, []);

  useEffect(() => {
    if (!leftMeta && !rightMeta) {
      loadNewPair();
    }
  }, [leftMeta, rightMeta, loadNewPair]);

  // Guess logic: pick which has higher CMC (converted mana cost)
  const makeGuess = async (side) => {
    if (!leftMeta || !rightMeta) return;
    const lCmc = typeof leftMeta.cmc === 'number' ? leftMeta.cmc : Number.NEGATIVE_INFINITY;
    const rCmc = typeof rightMeta.cmc === 'number' ? rightMeta.cmc : Number.NEGATIVE_INFINITY;
    let correct = null;
    if (lCmc === rCmc) correct = 'tie';
    else if (lCmc > rCmc) correct = 'left';
    else correct = 'right';

    if (correct === side) {
      setStreak((s) => s + 1);
    } else if (correct === 'tie') {
      // treat tie as neither correct nor incorrect — do not change streak
    } else {
      setStreak(0);
    }
    setResult(correct);
  };

  const next = () => {
    setLeftMeta(null);
    setRightMeta(null);
    loadNewPair();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">Commander Rank Guess — EDHREC</h1>
      <p className="mb-4 text-slate-300 max-w-xl text-center">Guess which commander has a better rank on EDHREC. Ranks are revealed after guessing. Your streak increases for each correct guess and resets to 0 on a wrong guess.</p>

      <div className="mb-4 flex items-center gap-4">
        <div className="bg-slate-700 px-4 py-2 rounded">Streak: <span className="font-semibold">{streak}</span></div>
        <button className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500" onClick={() => { setStreak(0); }}>Reset Streak</button>
        <button className="px-3 py-2 rounded bg-green-600 hover:bg-green-500" onClick={() => next()}>New Pair</button>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left */}
        <div className="bg-slate-900 rounded-lg p-4 flex flex-col items-center">
          <div className="w-full h-96 bg-black rounded overflow-hidden flex items-center justify-center relative">
            {/* Art as semi-transparent background */}
            {leftMeta && leftMeta.art && (
              <img src={leftMeta.art} alt={leftMeta.name + ' art'}
                className="absolute inset-0 w-full h-full object-cover opacity-40" style={{zIndex: 1}} />
            )}
            {/* Card image in foreground */}
            {leftMeta && leftMeta.cardImage ? (
              <img src={leftMeta.cardImage} alt={leftMeta.name + ' card'}
                className="relative z-10 max-h-80 object-contain rounded shadow-lg" />
            ) : (
              <div className="relative z-10 text-slate-500">{loadingPair ? 'Loading card...' : 'No card available'}</div>
            )}
          </div>
          <div className="w-full flex items-center justify-between mt-3">
            <div>
              <div className="font-semibold">{leftMeta?.name}</div>
              <div className="text-sm text-slate-400">{leftMeta?.set_name}</div>
              <div className="text-xs text-slate-400">CMC: {typeof leftMeta?.cmc === 'number' ? leftMeta.cmc : 'N/A'}</div>
              <div className="text-xs text-slate-400">{leftMeta?.oracle_text}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => makeGuess('left')} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Pick</button>
              <div className="text-slate-300">{result ? (result === 'left' ? 'Correct' : (result === 'tie' ? 'Tie' : 'Wrong')) : ''}</div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="bg-slate-900 rounded-lg p-4 flex flex-col items-center">
          <div className="w-full h-96 bg-black rounded overflow-hidden flex items-center justify-center relative">
            {/* Art as semi-transparent background */}
            {rightMeta && rightMeta.art && (
              <img src={rightMeta.art} alt={rightMeta.name + ' art'}
                className="absolute inset-0 w-full h-full object-cover opacity-40" style={{zIndex: 1}} />
            )}
            {/* Card image in foreground */}
            {rightMeta && rightMeta.cardImage ? (
              <img src={rightMeta.cardImage} alt={rightMeta.name + ' card'}
                className="relative z-10 max-h-80 object-contain rounded shadow-lg" />
            ) : (
              <div className="relative z-10 text-slate-500">{loadingPair ? 'Loading card...' : 'No card available'}</div>
            )}
          </div>
          <div className="w-full flex items-center justify-between mt-3">
            <div>
              <div className="font-semibold">{rightMeta?.name}</div>
              <div className="text-sm text-slate-400">{rightMeta?.set_name}</div>
              <div className="text-xs text-slate-400">CMC: {typeof rightMeta?.cmc === 'number' ? rightMeta.cmc : 'N/A'}</div>
              <div className="text-xs text-slate-400">{rightMeta?.oracle_text}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button onClick={() => makeGuess('right')} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500">Pick</button>
              <div className="text-slate-300">{result ? (result === 'right' ? 'Correct' : (result === 'tie' ? 'Tie' : 'Wrong')) : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-slate-400 max-w-3xl text-center">Guess which commander has the higher converted mana cost (CMC). Ties are possible. Click "New Pair" to play again.</div>

    </div>
  );
}

// Helper: fetch EDHREC commander JSON and parse rank
async function fetchEdhrecCommanderRank(slugOrName) {
  // Accept either a slug (like 'uril-the-miststalker') or a name. Prefer slug.
  const slug = slugOrName && slugOrName.includes("-") ? slugOrName : slugify(slugOrName || "");
  const urlsToTry = [
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}.json`,
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}-1.json`,
  ];
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const j = await res.json();
      // Look for rank in common locations
      if (j.rank) return Number(j.rank);
      if (j.stats && j.stats.rank) return Number(j.stats.rank);
      if (j.meta && j.meta.rank) return Number(j.meta.rank);
      // Some pages include panels or items with rank metadata
      if (j.items && Array.isArray(j.items)) {
        // items might be objects with title and rank -- attempt to find the commander item
        for (const it of j.items) {
          if (it && typeof it === 'object' && (it.rank || it.stats?.rank)) {
            return Number(it.rank || it.stats?.rank);
          }
        }
      }
    } catch (e) {
      // try next
    }
  }
  return null;
}