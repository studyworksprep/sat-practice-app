"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";


export default function PracticeSessionClient({ questionIds }) {
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState("");
  const [freeResponse, setFreeResponse] = useState("");
  const [result, setResult] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [markedForReview, setMarkedForReview] = useState(false);
  const [status, setStatus] = useState("");
  const [showMap, setShowMap] = useState(false);

  const contentRef = useRef(null);

  // Load question
  useEffect(() => {
    if (!questionIds?.length) return;

    async function loadQuestion() {
      const id = questionIds[index];

      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("id", id)
        .single();

      setQuestion(data);
      setSelected("");
      setFreeResponse("");
      setResult(null);
      setShowExplanation(false);
    }

    loadQuestion();
  }, [index, questionIds]);

  const options = useMemo(() => {
    if (!question) return [];
    if (Array.isArray(question.answer_options)) return question.answer_options;

    try {
      return JSON.parse(question.answer_options || "[]");
    } catch {
      return [];
    }
  }, [question]);

  const isFreeResponse = !options.length;

  async function toggleMarkForReview() {
    setMarkedForReview((v) => !v);
  }

  async function checkAnswer() {
    const answer = isFreeResponse ? freeResponse.trim() : selected;
    if (!answer) return;

    const correct = String(answer) === String(question.correct_answer);
    setResult(correct);
    setShowExplanation(correct);
  }

  if (!question) return null;

  return (
    <div className="page practiceWide">
      <div className="card">
        <div ref={contentRef} style={{ marginTop: 16 }}>
          <div className="bbLayout">

            {/* LEFT COLUMN */}
            <div className="bbLeft">
              <div
                className="optionContent"
                dangerouslySetInnerHTML={{ __html: question.stem }}
              />
            </div>

            {/* RIGHT COLUMN */}
            <div className="bbRight">

              {/* Header */}
              <div className="bbRightHeader">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="bbRightHeaderTitle">
                    Question {index + 1} of {questionIds.length}
                  </div>

                  <button
                    className="secondary"
                    onClick={toggleMarkForReview}
                  >
                    {markedForReview ? "★ Marked" : "☆ Mark"}
                  </button>
                </div>
              </div>

              {/* Answers */}
              {isFreeResponse ? (
                <div className="row" style={{ flexDirection: "column" }}>
                  <label><strong>Your answer</strong></label>
                  <input
                    value={freeResponse}
                    onChange={(e) => setFreeResponse(e.target.value)}
                  />
                </div>
              ) : (
                options.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  const isSelected = selected === label;

                  return (
                    <div
                      key={i}
                      className={`optionCard ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelected(label)}
                    >
                      <div className="optionLetter">{label}</div>
                      <div
                        className="optionContent"
                        dangerouslySetInnerHTML={{ __html: opt }}
                      />
                    </div>
                  );
                })
              )}

              {/* Result */}
              {result !== null && (
                <div className="card" style={{ marginTop: 16 }}>
                  <h3>{result ? "✅ Correct" : "❌ Incorrect"}</h3>

                  {!result && !showExplanation && (
                    <button
                      className="secondary"
                      onClick={() => setShowExplanation(true)}
                    >
                      Show explanation
                    </button>
                  )}

                  {showExplanation && (
                    <div
                      className="optionContent"
                      dangerouslySetInnerHTML={{ __html: question.rationale }}
                    />
                  )}
                </div>
              )}

              {/* Bottom Nav */}
              <div className="bottomNav">

                <button
                  className="secondary bottomNavMap"
                  onClick={() => setShowMap(true)}
                >
                  <span style={{ fontWeight: 800 }}>
                    Question {index + 1}
                  </span>
                  <span style={{ opacity: 0.7 }}>
                    {" "}of {questionIds.length}
                  </span>
                </button>

                <button onClick={checkAnswer}>
                  Check answer
                </button>

                <button
                  className="secondary"
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  ← Prev
                </button>

                <button
                  disabled={index === questionIds.length - 1}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  Next →
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Question Map Modal */}
      {showMap && (
        <div className="mapModalBackdrop" onClick={() => setShowMap(false)}>
          <div
            className="mapModal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Question Map</h3>

            <div className="mapGrid">
              {questionIds.map((_, i) => (
                <button
                  key={i}
                  className={`mapCell ${i === index ? "current" : ""}`}
                  onClick={() => {
                    setIndex(i);
                    setShowMap(false);
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              className="secondary"
              onClick={() => setShowMap(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
