import wishlistImage from './assets/VagabonesWishlist.png';
import React, { useState, useEffect } from "react";
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const [isCentered, setIsCentered] = useState(true);
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
  async function pickValidRankedCommanders(n = 6, maxAttempts = 50) {
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
      const cardsWithRanks = await pickValidRankedCommanders(6);
      setCommanderList(cardsWithRanks);
      setOrder(cardsWithRanks);
    }
    pickAndLoadRanks();
  }, []);

  // Centering logic runs after cards are loaded
  useEffect(() => {
    function updateCentering() {
      if (scrollRef.current) {
        const hasOverflow = scrollRef.current.scrollWidth > scrollRef.current.clientWidth;
        setIsCentered(!hasOverflow);
      }
    }
    updateCentering();
    window.addEventListener('resize', updateCentering);
    return () => {
      window.removeEventListener('resize', updateCentering);
    };
  }, [order]);

  // Dnd-kit drag and drop
  function handleDragEnd(event) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      // Get indices of incorrect cards
      const incorrectIndices = order.map((_, idx) => !correctPositions[idx] ? idx : null).filter(idx => idx !== null);
      // Get current incorrect cards
      const incorrectCards = incorrectIndices.map(idx => order[idx]);
      // Find indices in incorrectCards
      const oldIndex = incorrectCards.findIndex(card => card.id === active.id);
      const newIndex = incorrectCards.findIndex(card => card.id === over.id);
      // If either dragged or target card is not incorrect, do nothing
      if (oldIndex === -1 || newIndex === -1) return;
      // Reorder incorrect cards
      const newIncorrectCards = arrayMove(incorrectCards, oldIndex, newIndex);
      // Merge back into full order, keeping correct cards in place
      const newOrder = [...order];
      incorrectIndices.forEach((idx, i) => {
        newOrder[idx] = newIncorrectCards[i];
      });
      setOrder(newOrder);
    }
  }

  function SortableCard({ card, idx, isCorrect, isSolved }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      cursor: !isSolved && !isCorrect ? 'move' : 'default',
    };
    // Disable drag listeners/attributes if card is in correct slot
    const dragProps = !isSolved && !isCorrect ? { ...attributes, ...listeners } : {};
    return (
      <div ref={setNodeRef} style={style} {...dragProps} className="flex-1 min-h-[1px] flex flex-col items-center relative">
        {/* Absolutely positioned label above first card */}
        {idx === 0 && !isDragging && (
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-green-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Most Popular</span>
        )}
        {/* Absolutely positioned label above last card */}
        {idx === order.length - 1 && !isDragging && (
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-red-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Least Popular</span>
        )}
      <img src={card.image_uris.large} alt={card.name} className={`w-full max-h-[500px] object-contain ${isCorrect ? ' card-glow-green' : ''}`} style={{ borderRadius: '6%' }} />
        {isSolved && (
          <span className="text-base text-green-400 font-bold">Rank #{card.rank ?? "?"}</span>
        )}
      </div>
    );
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

  // Detect touch capability using window.matchMedia
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setIsTouchDevice(mq.matches);
    const handler = e => setIsTouchDevice(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 flex flex-col items-center">
      {isTouchDevice && (
        <div className="w-full bg-yellow-400 text-black text-center py-2 mb-4 rounded font-bold text-sm shadow-lg">
          Mobile is not yet supported. For the best experience, please use a desktop device.
        </div>
      )}
      <h1 className="text-3xl font-bold mb-4 text-center">Daily Ranking Challenge</h1>
      <p className="mb-4 text-slate-300 max-w-xl text-center">
        Drag to rearrange the commanders from <b>most popular (left)</b> to <b>least popular (right)</b>. Popularity is based on EDHREC rank.
      </p>

      {/* Card grid with dnd-kit sortable, no horizontal scroll, fits screen */}
      <div className="w-full" ref={scrollRef}>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={order.filter((_, idx) => !correctPositions[idx]).map(card => card.id)}
            strategy={rectSortingStrategy}
          >
              <div
                className="
                  w-full
                  flex flex-row flex-wrap
                  gap-4 mb-6 pt-6
                "
              >
              {order.map((card, idx) => {
                if (!card || !card.image_uris || !card.image_uris.large) return null;
                const isCorrect = correctPositions[idx];
                // Only make incorrect cards sortable
                if (isCorrect) {
                  return (
                    <div key={card.id} className="flex-1 min-h-[1px] flex flex-col items-center relative">
                      {idx === 0 && (
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-green-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Most Popular</span>
                      )}
                      {idx === order.length - 1 && (
                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-red-300 uppercase tracking-wide text-center pointer-events-none" style={{whiteSpace: 'nowrap'}}>Least Popular</span>
                      )}
                      <img src={card.image_uris.large} alt={card.name} className="w-full max-h-[500px] object-contain mb-3 shadow-lg card-glow-green" style={{ borderRadius: '6%' }} />
                      {isSolved && (
                        <span className="text-base text-green-400 font-bold">Rank #{card.rank ?? "?"}</span>
                      )}
                    </div>
                  );
                } else {
                  return (
                    <SortableCard key={card.id} card={card} idx={idx} isCorrect={isCorrect} isSolved={isSolved} />
                  );
                }
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      {/* Removed custom mobile drag-scroll bar to avoid interfering with dnd-kit touch drag-and-drop */}
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
