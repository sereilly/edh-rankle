// Helper: Render color identity as icons
function renderColorIdentity(colorIdentity) {
  if (!Array.isArray(colorIdentity) || colorIdentity.length === 0) colorIdentity = ['C'];
  return (
    <span className="inline-flex items-center gap-1">
      {colorIdentity.map((c, i) => (
        <img
          key={i}
          src={`https://svgs.scryfall.io/card-symbols/${c}.svg`}
          alt={c}
          style={{height: '1.2em'}}
        />
      ))}
    </span>
  );
}
// Helper: Render mana value as icons
// Helper: Render mana value as icons (generic, colored, hybrid)
function renderManaIcons(cmc, manaCost) {
  if (typeof cmc !== 'number' || cmc < 0) return null;
  if (!manaCost || typeof manaCost !== 'string' || manaCost.trim() === '') {
    if (cmc === 0) {
      return <img src="https://svgs.scryfall.io/card-symbols/0.svg" alt="0" style={{height: '1.2em'}} />;
    }
    if (cmc > 10) {
      return <span className="inline-flex items-center"><img src="https://svgs.scryfall.io/card-symbols/10.svg" alt="10" style={{height: '1.2em'}} /> <span className="ml-1">({cmc})</span></span>;
    }
    return (
      <span className="inline-flex items-center">
        {[...Array(cmc)].map((_, i) => (
          <img key={i} src={`https://svgs.scryfall.io/card-symbols/1.svg`} alt="1" style={{height: '1.2em'}} />
        ))}
      </span>
    );
  }
  const symbolRegex = /\{([^}]+)\}/g;
  const symbols = [];
  let match;
  while ((match = symbolRegex.exec(manaCost)) !== null) {
    symbols.push(match[1].replace(/\//g, ""));
  }
  return (
    <span className="inline-flex items-center">
      {symbols.map((sym, i) => (
        <img
          key={i}
          src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(sym)}.svg`}
          alt={sym}
          style={{height: '1.2em', paddingLeft: '0.2em'}}
        />
      ))}
    </span>
  );
}

import React, {useEffect, useState, useCallback} from "react";
import commanders from './commanders.json';

function getRandomCommander() {
  const idx = Math.floor(Math.random() * commanders.length);
  const card = commanders[idx];
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

import wishlistImage from './assets/VagabonesWishlist.png';

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

// ...existing code...

function slugify(name) {
  // Normalize and remove accents
  return String(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
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
  const [leftMeta, setLeftMeta] = useState(null);
  const [rightMeta, setRightMeta] = useState(null);
  const [streak, setStreak] = useState(0);
  const [lastStreak, setLastStreak] = useState(null);
  const [highestStreak, setHighestStreak] = useState(0);
  const [result, setResult] = useState(null); // 'left' | 'right' | 'tie' | null
  const [loadingPair, setLoadingPair] = useState(false);
  const [userGuess, setUserGuess] = useState(null);
  // Filter toggles
  const [includePartner, setIncludePartner] = useState(true);
  const [includeUnreleased, setIncludeUnreleased] = useState(true);
  const [includeIllegal, setIncludeIllegal] = useState(true);



  // Helper: filter commanders based on toggles
  function getFilteredCommanders() {
    const now = new Date();
    return commanders.filter(card => {
      // Partner filter
      if (!includePartner && Array.isArray(card.keywords) && card.keywords.includes("Partner")) return false;
      // Unreleased filter
      if (!includeUnreleased && card.released_at && new Date(card.released_at) > now) return false;
      // Illegal filter
      if (!includeIllegal && card.legalities && card.legalities.commander !== "legal") return false;
      return true;
    });
  }

  const loadNewPair = useCallback(async () => {
    setResult(null);
    setLeftMeta(null);
    setRightMeta(null);
    setLoadingPair(true);
    try {
      let left, right, leftRank, rightRank;
      let attempts = 0;
      // Pick two distinct commanders from the filtered array
      const filtered = getFilteredCommanders();
      if (!filtered || filtered.length < 2) {
        setLeftMeta({ error: "Not enough commanders match the filters." });
        setRightMeta({ error: "Not enough commanders match the filters." });
        setLoadingPair(false);
        return;
      }
      do {
        const [leftCard, rightCard] = pickTwoDistinct(filtered).map(card => ({
          name: card.name,
          set_name: card.set_name,
          art: card.image_uris?.art_crop || null,
          cardImage: card.image_uris?.large || null,
          scryfall: card,
          cmc: card.cmc,
          power: card.power,
          toughness: card.toughness,
          oracle_text: card.oracle_text,
        }));
        left = leftCard;
        right = rightCard;
        // If same name, retry
        if (left.name === right.name) {
          attempts++;
          continue;
        }
        // Fetch ranks in parallel
        const [lRank, rRank] = await Promise.all([
          fetchEdhrecCommanderRank(left.name),
          fetchEdhrecCommanderRank(right.name)
        ]);
        leftRank = lRank;
        rightRank = rRank;
        attempts++;
      } while ((typeof leftRank !== 'number' || leftRank <= 0 || typeof rightRank !== 'number' || rightRank <= 0 || left.name === right.name) && attempts < 10);

      // If either still fails, show error
      if (typeof leftRank !== 'number' || typeof rightRank !== 'number' || left.name === right.name) {
        setLeftMeta({ error: "Failed to fetch valid commander from list." });
        setRightMeta({ error: "Failed to fetch valid commander from list." });
      } else {
        setLeftMeta({ ...left, rank: leftRank });
        setRightMeta({ ...right, rank: rightRank });
      }
    } catch (e) {
      setLeftMeta({ error: "Failed to fetch commander from list." });
      setRightMeta({ error: "Failed to fetch commander from list." });
    } finally {
      setLoadingPair(false);
    }
  }, [includePartner, includeUnreleased, includeIllegal]);

  useEffect(() => {
    loadNewPair();
  }, []);

  const makeGuess = async (side) => {
    if (!leftMeta || !rightMeta) return;
    setUserGuess(side);
    const lRank = typeof leftMeta.rank === 'number' ? leftMeta.rank : Number.POSITIVE_INFINITY;
    const rRank = typeof rightMeta.rank === 'number' ? rightMeta.rank : Number.POSITIVE_INFINITY;
    let correct = null;
    if (lRank === rRank) correct = 'tie';
    else if (lRank < rRank) correct = 'left'; // lower rank is better
    else correct = 'right';

    if (correct === side) {
      setStreak((s) => {
        const newStreak = s + 1;
        if (newStreak > highestStreak) setHighestStreak(newStreak);
        return newStreak;
      });
    } else if (correct === 'tie') {
      // treat tie as neither correct nor incorrect — do not change streak
    } else {
      setLastStreak(streak);
      setStreak(0);
    }
    setResult(correct);
  };

  const next = () => {
  setLeftMeta(null);
  setRightMeta(null);
  setUserGuess(null);
  loadNewPair();
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-4">EDH Rankle</h1>
      <p className="mb-4 text-slate-300 max-w-xl text-center">Guess which commander has a better rank on <a href="https://edhrec.com" target="_blank" rel="noopener noreferrer" className="underline">EDHREC</a>. Ranks are revealed after guessing. Your score increases for each correct guess.</p>

      <div className="mb-4 flex flex-col items-center gap-2 w-full">
        <div className="flex items-center gap-4 mb-2">
          <div className="bg-slate-700 px-4 py-2 rounded flex items-center gap-3">
            <span>Score: <span className="font-semibold">{streak}</span></span>
            <span className="text-slate-400">| Highest: <span className="font-semibold">{highestStreak}</span></span>
          </div>
          <button className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500" onClick={() => { setStreak(0); next(); }}>New Game</button>
        </div>
        {/* Filter toggles row */}
        <div className="flex flex-row gap-4 justify-center items-center w-full">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includePartner} onChange={e => setIncludePartner(e.target.checked)} />
            <span className="text-sm">Include Solo Partners</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeUnreleased} onChange={e => setIncludeUnreleased(e.target.checked)} />
            <span className="text-sm">Include Unreleased</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeIllegal} onChange={e => setIncludeIllegal(e.target.checked)} />
            <span className="text-sm">Include Illegal</span>
          </label>
        </div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left */}
        <div
          className="bg-slate-900 rounded-lg p-4 flex flex-col justify-between items-center"
        >
          <div className="w-full">
            <div className="w-full h-96 bg-black overflow-hidden flex items-center justify-center relative">
              {/* Rank above card */}
              {result && (
                <div className="absolute top-2 left-0 w-full flex justify-center z-20">
                  <span className="text-4xl font-extrabold text-indigo-300 drop-shadow-lg bg-slate-900 bg-opacity-80 px-4 py-2 rounded">
                    {typeof leftMeta?.rank === 'number' ? `Rank #${leftMeta.rank}` : 'Rank unavailable'}
                  </span>
                </div>
              )}
              {/* Art as semi-transparent background */}
              {leftMeta && leftMeta.art && (
                <img src={leftMeta.art} alt={leftMeta.name + ' art'}
                  className="absolute inset-0 w-full h-full object-cover opacity-40" style={{zIndex: 1}} />
              )}
              {/* Card image in foreground */}
              {leftMeta && leftMeta.cardImage ? (
                <img
                  src={leftMeta.cardImage}
                  alt={leftMeta.name + ' card'}
                  className={`relative z-10 max-h-80 object-contain shadow-lg card cursor-pointer}`}
                  style={{borderRadius: '11px'}}
                  onClick={() => !result && !loadingPair && makeGuess('left')}
                  onMouseMove={e => {
                    const img = e.currentTarget;
                    const rect = img.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = ((y - centerY) / centerY) * -10;
                    const rotateY = ((x - centerX) / centerX) * 10;
                      img.style.setProperty('--rotate-x', `${rotateX}deg`);
                      img.style.setProperty('--rotate-y', `${rotateY}deg`);
                      img.style.transform = 'perspective(800px) rotateX(var(--rotate-x)) rotateY(var(--rotate-y))';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = '';
                  }}
                />
              ) : (
                <div className="relative z-10 text-slate-500 flex items-center gap-2">
                  {loadingPair ? (
                    <>
                      <span>Loading card...</span>
                      <span className="inline-block w-5 h-5 border-2 border-t-2 border-t-indigo-400 border-gray-400 rounded-full animate-spin"></span>
                    </>
                  ) : 'No card available'}
                </div>
              )}
            </div>
            {!loadingPair && (
              <div className="w-full flex flex-col items-start mt-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{leftMeta?.name}</span>
                  {renderColorIdentity(leftMeta?.scryfall?.color_identity)}
                </div>
                <div className="text-sm text-slate-400">{leftMeta?.set_name}</div>
                <div className="text-xs text-slate-400 flex items-center">Mana Value: {renderManaIcons(leftMeta?.cmc, leftMeta?.scryfall?.mana_cost) || 'N/A'}</div>
                <div className="text-xs text-slate-400">{leftMeta?.oracle_text}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div
          className="bg-slate-900 rounded-lg p-4 flex flex-col justify-between items-center"
        >
          <div className="w-full">
            <div className="w-full h-96 bg-black overflow-hidden flex items-center justify-center relative">
              {/* Rank above card */}
              {result && (
                <div className="absolute top-2 left-0 w-full flex justify-center z-20">
                  <span className="text-4xl font-extrabold text-indigo-300 drop-shadow-lg bg-slate-900 bg-opacity-80 px-4 py-2 rounded">
                    {typeof rightMeta?.rank === 'number' ? `Rank #${rightMeta.rank}` : 'Rank unavailable'}
                  </span>
                </div>
              )}
              {/* Art as semi-transparent background */}
              {rightMeta && rightMeta.art && (
                <img src={rightMeta.art} alt={rightMeta.name + ' art'}
                  className="absolute inset-0 w-full h-full object-cover opacity-40" style={{zIndex: 1}} />
              )}
              {/* Card image in foreground */}
              {rightMeta && rightMeta.cardImage ? (
                <img
                  src={rightMeta.cardImage}
                  alt={rightMeta.name + ' card'}
                  className={`relative z-10 max-h-80 object-contain shadow-lg card cursor-pointer`}
                  style={{borderRadius: '11px'}}
                  onClick={() => !result && !loadingPair && makeGuess('right')}
                  onMouseMove={e => {
                    const img = e.currentTarget;
                    const rect = img.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = ((y - centerY) / centerY) * -10;
                    const rotateY = ((x - centerX) / centerX) * 10;
                      img.style.setProperty('--rotate-x', `${rotateX}deg`);
                      img.style.setProperty('--rotate-y', `${rotateY}deg`);
                      img.style.transform = 'perspective(800px) rotateX(var(--rotate-x)) rotateY(var(--rotate-y))';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = '';
                  }}
                />
              ) : (
                <div className="relative z-10 text-slate-500 flex items-center gap-2">
                  {loadingPair ? (
                    <>
                      <span>Loading card...</span>
                      <span className="inline-block w-5 h-5 border-2 border-t-2 border-t-indigo-400 border-gray-400 rounded-full animate-spin"></span>
                    </>
                  ) : 'No card available'}
                </div>
              )}
            </div>
            {!loadingPair && (
              <div className="w-full flex flex-col items-start mt-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{rightMeta?.name}</span>
                  {renderColorIdentity(rightMeta?.scryfall?.color_identity)}
                </div>
                <div className="text-sm text-slate-400">{rightMeta?.set_name}</div>
                <div className="text-xs text-slate-400 flex items-center">Mana Value: {renderManaIcons(rightMeta?.cmc, rightMeta?.scryfall?.mana_cost) || 'N/A'}</div>
                <div className="text-xs text-slate-400">{rightMeta?.oracle_text}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Centered result message and New Pair/New Game button */}
      {result && (
        <>
          <div className="w-full flex justify-center items-center mt-8">
            {result === 'tie' ? (
              <div className="text-5xl font-bold text-white drop-shadow-lg">Tie</div>
            ) : (
              <div className={`text-5xl font-bold drop-shadow-lg ${result === userGuess ? 'text-green-500' : 'text-red-500'}`}>{result === userGuess ? 'Correct' : 'Wrong'}</div>
            )}
          </div>
          <div className="w-full flex justify-center items-center mt-6">
            {result === userGuess && result !== 'tie' ? (
              <button className="px-5 py-3 rounded bg-green-600 hover:bg-green-500 text-xl font-semibold" onClick={() => next()}>Next</button>
            ) : result === 'tie' ? null : (
              <div className="flex flex-col items-center">
                <button className="px-5 py-3 rounded bg-red-600 hover:bg-red-500 text-xl font-semibold mb-2" onClick={() => { next(); setLastStreak(null); }}>New Game</button>
                <div className="text-lg text-slate-300">Final Score: <span className="font-bold">{lastStreak !== null ? lastStreak : streak}</span></div>
                {(lastStreak !== null ? lastStreak : streak) === highestStreak && highestStreak > 0 && (
                  <div className="text-green-500 text-lg font-bold mt-1">New Record</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <div className="w-full flex justify-center items-center mt-8 mb-2 gap-6">
        <a href="https://store.steampowered.com/app/3157380/Vagabones/" target="_blank" rel="noopener noreferrer">
          <img src={wishlistImage} alt="Vagabones Wishlist Banner" className="h-auto" style={{display: 'block'}} />
        </a>
        <span className="text-white text-lg font-bold uppercase text-center">
          Also, wishlist our game Vagabones on{' '}
          <a href="https://store.steampowered.com/app/3157380/Vagabones/" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300">STEAM</a>!
        </span>
      </div>
    </div>
  );
}

// Helper: fetch EDHREC commander JSON and parse rank
// Helper: extract latest rank from EDHREC JSON
function getLatestCommanderRank(json) {
  if (!json || typeof json !== 'object') return null;
  if (!json || typeof json !== 'object') return null;
  const container = json.container;
  if (!container || typeof container !== 'object') return null;
  const jsonDict = container.json_dict;
  if (!jsonDict || typeof jsonDict !== 'object') return null;
  const card = jsonDict.card;
  if (!card || typeof card !== 'object') return null;
  if (typeof card.rank === 'number') return card.rank;
  if (typeof card.rank === 'string') return Number(card.rank);
  return null;
}
async function fetchEdhrecCommanderRank(slugOrName) {
  // Always use slugify(name) for EDHREC URL
  const slug = slugify(slugOrName || "");
  const urlsToTry = [
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}.json`,
    `https://json.edhrec.com/pages/commanders/${encodeURIComponent(slug)}-1.json`,
  ];
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const j = await res.json();
      // Prefer latest rank from rank_over_time if available
      const latestRank = getLatestCommanderRank(j);
      if (latestRank != null) return Number(latestRank);
      // Look for rank in common locations
      if (j.rank) return Number(j.rank);
      if (j.stats && j.stats.rank) return Number(j.stats.rank);
      if (j.meta && j.meta.rank) return Number(j.meta.rank);
      // Some pages include panels or items with rank metadata
      if (j.items && Array.isArray(j.items)) {
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