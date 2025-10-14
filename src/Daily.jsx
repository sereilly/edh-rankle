import wishlistImage from './assets/VagabonesWishlist.png';
import React, { useState, useEffect } from "react";
import commanders from "./commanders.json";
import { getFilteredCommanders, fetchEdhrecCommanderRank } from "./App.jsx";

function getRanks(cards) {
  return cards.map(card => card.rank ?? 9999);
}

function getDailySeed() {
  const now = new Date();
  // Use UTC date for consistency
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  return Number(`${year}${month}${day}`);
}
export default function Daily() {
  // Ref for scroll container
  const scrollRef = React.useRef(null);
  const [commanderList, setCommanderList] = useState([]);
  const [order, setOrder] = useState([]);
  const [guessHistory, setGuessHistory] = useState([]);
  const [isSolved, setIsSolved] = useState(false);
  const [correctPositions, setCorrectPositions] = useState([]);

  useEffect(() => {
    // Seeded random function
    function seededRandom(seed) {
      let x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }
  async function pickValidRankedCommanders(n = 7, maxAttempts = 50) {
      const arr = [...getFilteredCommanders()];
      const result = [];
      let attempts = 0;
      const seedBase = getDailySeed();
      while (result.length < n && arr.length && attempts < maxAttempts) {
        // Use seeded random for deterministic daily selection
        const idx = Math.floor(seededRandom(seedBase + attempts) * arr.length);
        const card = arr[idx];
        arr.splice(idx, 1);
        const rank = await fetchEdhrecCommanderRank(card.name);
        if (typeof rank === 'number' && rank > 0) {
          result.push({ ...card, rank });
        }
        attempts++;
      }
      return result;
    }
    async function pickAndLoadRanks() {
      const cardsWithRanks = await pickValidRankedCommanders(7);
      setCommanderList(cardsWithRanks);
      setOrder(cardsWithRanks);
    }
    pickAndLoadRanks();
  }, []);

  // Drag and drop handlers
  const [draggedIdx, setDraggedIdx] = useState(null);
  // Helper: get indices of incorrect cards
  function getIncorrectIndices() {
    return correctPositions.map((isCorrect, idx) => isCorrect ? null : idx).filter(idx => idx !== null);
  }

  function handleDragStart(idx) {
    // Before first guess, all cards are draggable
    if (!correctPositions.length || !correctPositions[idx]) {
      setDraggedIdx(idx);
      // Disable horizontal scroll
      if (scrollRef.current) scrollRef.current.style.overflowX = 'hidden';
    }
  }
  function handleDragOver(idx) {
    // Before first guess, allow all cards to be reordered
    if (!correctPositions.length) {
      if (draggedIdx === null || draggedIdx === idx) return;
      const newOrder = [...order];
      const [moved] = newOrder.splice(draggedIdx, 1);
      newOrder.splice(idx, 0, moved);
      setOrder(newOrder);
      setDraggedIdx(idx);
      return;
    }
    // After guess, only allow incorrect cards to be reordered
    if (draggedIdx === null || draggedIdx === idx || correctPositions[idx]) return;
    const incorrectIndices = getIncorrectIndices();
    const draggedIncorrectIdx = incorrectIndices.indexOf(draggedIdx);
    const overIncorrectIdx = incorrectIndices.indexOf(idx);
    if (draggedIncorrectIdx === -1 || overIncorrectIdx === -1) return;
    const incorrectCards = incorrectIndices.map(i => order[i]);
    const [moved] = incorrectCards.splice(draggedIncorrectIdx, 1);
    incorrectCards.splice(overIncorrectIdx, 0, moved);
    const newOrder = [...order];
    incorrectIndices.forEach((i, k) => { newOrder[i] = incorrectCards[k]; });
    setOrder(newOrder);
    setDraggedIdx(idx);
  }
  function handleDragEnd() {
  setDraggedIdx(null);
  // Re-enable horizontal scroll
  if (scrollRef.current) scrollRef.current.style.overflowX = 'auto';
  }

  function handleGuess() {
    const ranks = getRanks(order);
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    const correctness = ranks.map((rank, i) => rank === sortedRanks[i]);
    const ids = order.map(card => card.id).join(',');
    setGuessHistory([...guessHistory, { correctness, ids }]);
    setCorrectPositions(correctness);
    if (correctness.every(Boolean)) setIsSolved(true);
  }

  return (
  <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 flex flex-col items-center">
  <h1 className="text-3xl font-bold mb-4 text-center">Daily Ranking Challenge</h1>
  <p className="mb-4 pb-4 text-slate-300 max-w-xl text-center">
        Drag to arrange the commanders from <b>most popular (left)</b> to <b>least popular (right)</b>. Popularity is based on EDHREC rank.
      </p>

      {/* Labels rendered inside first and last card components */}
      <div className="w-full overflow-x-auto" ref={scrollRef}>
        <div className="flex gap-4 mb-6 flex-nowrap justify-center lg:justify-center pt-6">
          {order.map((card, idx) => {
            // Skip rendering if card is undefined or missing image_uris
            if (!card || !card.image_uris || !card.image_uris.large) return null;
            const isCorrect = correctPositions[idx];
            return (
              <div key={card.id} className="flex flex-col items-center relative min-w-[180px]">
                {/* Absolutely positioned label above first card */}
                {idx === 0 && (
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-green-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Most Popular</span>
                )}
                {/* Absolutely positioned label above last card */}
                {idx === order.length - 1 && (
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-red-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Least Popular</span>
                )}
                <div
                  className={`bg-slate-900 rounded-lg p-2 flex flex-col items-center ${!isSolved && !isCorrect ? 'cursor-move' : ''}`}
                  draggable={!isSolved && !isCorrect}
                  onDragStart={() => { if (!isSolved && !isCorrect) handleDragStart(idx); }}
                  onDragOver={e => { if (!isSolved && !isCorrect) { e.preventDefault(); handleDragOver(idx); } }}
                  onDragEnd={handleDragEnd}
                  onTouchStart={() => { if (!isSolved && !isCorrect) handleDragStart(idx); }}
                  onTouchMove={e => {
                    if (!isSolved && !isCorrect) {
                      const touch = e.touches[0];
                      // Use scroll position to determine overIdx for horizontal scroll
                      const container = e.currentTarget.parentNode.parentNode;
                      const rect = container.getBoundingClientRect();
                      const x = touch.clientX - rect.left + container.scrollLeft;
                      const cardWidth = 180; // min-w-[180px]
                      const overIdx = Math.floor(x / cardWidth);
                      handleDragOver(overIdx);
                    }
                  }}
                  onTouchEnd={handleDragEnd}
                  style={{ opacity: draggedIdx === idx ? 0.5 : 1 }}
                >
                  <img src={card.image_uris.large} alt={card.name} className={`max-h-64 mb-3 shadow-lg${isCorrect ? ' card-glow-green' : ''}`} style={{ borderRadius: '12px' }} />
                  <span className="font-semibold text-center mb-2 text-sm md:text-base lg:text-lg">{card.name}</span>
                  {isSolved && (
                    <span className="text-base text-green-400 font-bold">Rank #{card.rank ?? "?"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <button
        className={`px-4 py-2 rounded mb-4 ${(() => {
          if (isSolved) return 'bg-indigo-600 hover:bg-indigo-500';
          if (!guessHistory.length) return 'bg-indigo-600 hover:bg-indigo-500';
          const last = guessHistory[guessHistory.length - 1];
          const currentIds = order.map(card => card.id).join(',');
          return last && last.ids === currentIds ? 'bg-gray-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500';
        })()}`}
        onClick={isSolved ? () => window.location.reload() : handleGuess}
        disabled={(() => {
          if (isSolved) return false;
          if (!guessHistory.length) return false;
          const last = guessHistory[guessHistory.length - 1];
          const currentIds = order.map(card => card.id).join(',');
          return last && last.ids === currentIds;
        })()}
      >
        {isSolved ? 'Reset' : 'Guess Order'}
      </button>
      <div className="flex flex-col items-center">
        <span className="mb-2">Guesses: {guessHistory.length}</span>
        <div className="flex flex-col gap-2">
          {guessHistory.map((guess, i) => (
            <div key={i} className="flex flex-row gap-1">
              {guess.correctness.map((correct, j) => (
                <span
                  key={j}
                  className={`inline-block w-4 h-4 rounded ${correct ? "bg-green-500" : "bg-red-500"}`}
                ></span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {isSolved && (
        <div className="mt-6 text-green-400 font-bold text-xl">You solved it!</div>
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
