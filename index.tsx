import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// --- Types ---
type Difficulty = 'Easy' | 'Medium' | 'Hard';

interface Question {
  question: string;
  options: string[];
  imageBase64?: string;
}

interface FullQuestion extends Question {
    correctAnswerIndex: number;
    userAnswerIndex: number | null;
}

interface UserScore {
  name: string;
  score: number;
}


// --- API Service ---
const API_BASE_URL = 'http://localhost:3000';

class ApiQuizService {
  async startQuiz(name: string, difficulty: Difficulty, topic: string, visual: boolean): Promise<{ sessionId: string; totalQuestions: number }> {
    const response = await fetch(`${API_BASE_URL}/startQuiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, difficulty, topic, visual }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start quiz');
    }
    return response.json();
  }

  async getQuestion(sessionId: string): Promise<Question & { questionIndex: number } | null> {
    const response = await fetch(`${API_BASE_URL}/getQuestion?sessionId=${sessionId}`);
    if (response.status === 404) return null; // No more questions
    if (!response.ok) throw new Error('Failed to fetch question');
    return response.json();
  }

  async submitAnswer(sessionId: string, questionIndex: number, answerIndex: number): Promise<{ correct: boolean; score: number }> {
    const response = await fetch(`${API_BASE_URL}/submitAnswer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionIndex, answerIndex })
    });
    if (!response.ok) throw new Error('Failed to submit answer');
    return response.json();
  }
  
  async getHint(sessionId: string, questionIndex: number): Promise<{ hint: string }> {
    const response = await fetch(`${API_BASE_URL}/getHint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionIndex }),
    });
    if (!response.ok) throw new Error('Failed to get hint');
    return response.json();
  }

  async endQuiz(sessionId: string): Promise<UserScore & { questions: FullQuestion[] }> {
    const response = await fetch(`${API_BASE_URL}/endQuiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!response.ok) throw new Error('Failed to end quiz');
    return response.json();
  }

  async getLeaderboard(): Promise<UserScore[]> {
    const response = await fetch(`${API_BASE_URL}/getLeaderboard`);
    if (!response.ok) throw new Error('Failed to get leaderboard');
    return response.json();
  }

  async explainMistake(question: FullQuestion): Promise<{ explanation: string }> {
    const { question: qText, options, correctAnswerIndex, userAnswerIndex } = question;
    const response = await fetch(`${API_BASE_URL}/explainMistake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: qText, options, correctAnswerIndex, userAnswerIndex }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get explanation');
    }
    return response.json();
  }
}

const quizService = new ApiQuizService();


// --- Components ---

// --- Card Component ---
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl shadow-2xl p-6 sm:p-8 ${className}`}>
      {children}
    </div>
  );
};


// --- LoginScreen Component ---
interface LoginScreenProps {
  onLogin: (name: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && !isLoading) {
      setIsLoading(true);
      setError('');
      try {
        await onLogin(name.trim());
      } catch (error: any) {
        console.error(error);
        setError(error.message || 'Could not start the quiz. Please try again.');
        setIsLoading(false);
      }
    }
  };

  return (
    <Card className="text-center">
      <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">AI-Powered Quiz!</h1>
      <p className="text-gray-400 mb-8">Enter your name to begin.</p>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your Name"
          className="w-full max-w-sm px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
          required
          autoFocus
        />

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        <button
          type="submit"
          disabled={!name.trim() || isLoading}
          className="w-full max-w-sm px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
        >
          {isLoading ? 'Generating Quiz...' : 'Start Quiz'}
        </button>
      </form>
    </Card>
  );
};

// --- HintModal Component ---
interface HintModalProps {
    hint: string;
    onClose: () => void;
    isLoading: boolean;
}
const HintModal: React.FC<HintModalProps> = ({ hint, onClose, isLoading }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 shadow-xl max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-yellow-400 mb-4">💡 Hint</h3>
                {isLoading ? (
                    <p className="text-gray-300">Generating hint...</p>
                ) : (
                    <p className="text-gray-300">{hint}</p>
                )}
                <button 
                    onClick={onClose}
                    className="mt-6 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
};


// --- QuizScreen Component ---
const QUIZ_DURATION_SECONDS = 60;

interface QuizScreenProps {
  sessionId: string;
  difficulty: Difficulty;
  totalQuestions: number;
  onQuizEnd: (sessionId: string) => void;
}

const QuizScreen: React.FC<QuizScreenProps> = ({ sessionId, difficulty, totalQuestions, onQuizEnd }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestion] = useState<Question | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION_SECONDS);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [answerStatus, setAnswerStatus] = useState<'correct' | 'incorrect' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showHintModal, setShowHintModal] = useState(false);
  const [hint, setHint] = useState('');
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [wasHintRequested, setWasHintRequested] = useState(false);


  const fetchNextQuestion = useCallback(async () => {
    setIsLoading(true);
    const nextQuestionData = await quizService.getQuestion(sessionId);
    setIsLoading(false);
    if (nextQuestionData) {
        setQuestion(nextQuestionData);
        setCurrentQuestionIndex(nextQuestionData.questionIndex);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setAnswerStatus(null);
        setHint('');
        setWasHintRequested(false);
    } else {
        onQuizEnd(sessionId);
    }
  }, [sessionId, onQuizEnd]);

  useEffect(() => {
    fetchNextQuestion();
  }, []);
  
  // Master timer for the whole quiz
  useEffect(() => {
    if (timeLeft <= 0) {
        onQuizEnd(sessionId);
        return;
    }
    const timerId = setInterval(() => {
        setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, onQuizEnd, sessionId]);

  const handleAnswerSubmit = async (answerIndex: number) => {
    if (isAnswered) return;

    setSelectedAnswer(answerIndex);
    setIsAnswered(true);

    const result = await quizService.submitAnswer(sessionId, currentQuestionIndex, answerIndex);
    setAnswerStatus(result.correct ? 'correct' : 'incorrect');

    setTimeout(() => {
      fetchNextQuestion();
    }, 1000);
  };

  const handleGetHint = async () => {
    if (wasHintRequested) {
        setShowHintModal(true);
        return;
    }
    setShowHintModal(true);
    setIsHintLoading(true);
    setWasHintRequested(true);
    try {
        const result = await quizService.getHint(sessionId, currentQuestionIndex);
        setHint(result.hint);
    } catch (error) {
        console.error(error);
        setHint('Could not fetch a hint at this time.');
    } finally {
        setIsHintLoading(false);
    }
  };


  const getButtonClass = (index: number) => {
    if (!isAnswered) return 'bg-gray-700 hover:bg-blue-600';
    if (index === selectedAnswer) return answerStatus === 'correct' ? 'bg-green-500' : 'bg-red-500';
    return 'bg-gray-700 cursor-not-allowed';
  };
  
  if (isLoading || !question) {
    return <Card><div className="text-center text-xl">Loading Question...</div></Card>;
  }

  return (
    <>
      {showHintModal && <HintModal hint={hint} isLoading={isHintLoading} onClose={() => setShowHintModal(false)} />}
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="text-5xl font-bold text-yellow-400 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-full w-24 h-24 flex items-center justify-center shadow-lg">
          {timeLeft}
        </div>
        <Card className="w-full relative">
          <div className="absolute top-4 right-4">
              <button 
                  onClick={handleGetHint}
                  disabled={isAnswered}
                  className="px-3 py-1 text-sm bg-yellow-600/50 text-yellow-200 rounded-full hover:bg-yellow-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Get a hint"
              >
                  💡 Get Hint
              </button>
          </div>
          <div className="mb-4 flex justify-between items-center">
            <p className="text-gray-400 text-sm">Question {currentQuestionIndex + 1} of {totalQuestions}</p>
            <p className="text-sm font-semibold px-3 py-1 rounded-full bg-blue-600/50 text-blue-200 capitalize">{difficulty}</p>
          </div>
          
          {question.imageBase64 && (
              <div className="mb-6 rounded-lg overflow-hidden shadow-lg">
                  <img 
                      src={`data:image/jpeg;base64,${question.imageBase64}`}
                      alt="Quiz context"
                      className="w-full h-auto max-h-80 object-contain"
                  />
              </div>
          )}
          
          <h2 className="text-2xl font-semibold mb-6">{question.question}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleAnswerSubmit(index)}
                disabled={isAnswered}
                className={`w-full p-4 text-left font-semibold rounded-lg transition-all duration-300 transform ${getButtonClass(index)}`}
              >
                {option}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
};


// --- ResultsScreen Component ---
interface ResultsScreenProps {
  score: UserScore;
  totalQuestions: number;
  onPlayAgain: () => void;
  onShowLeaderboard: () => void;
  onReviewAnswers: () => void;
}

const ResultsScreen: React.FC<ResultsScreenProps> = ({ score, totalQuestions, onPlayAgain, onShowLeaderboard, onReviewAnswers }) => {
  const percentage = totalQuestions > 0 ? Math.round((score.score / totalQuestions) * 100) : 0;
  
  const getFeedback = () => {
    if (percentage === 100) return "Perfect Score! 🥳";
    if (percentage >= 80) return "Excellent Job! 🎉";
    if (percentage >= 50) return "Good Effort! 👍";
    return "Better luck next time! 🤞";
  };

  return (
    <Card className="text-center">
      <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">Quiz Completed!</h1>
      <p className="text-lg text-gray-300 mb-6">{getFeedback()}</p>
      
      <div className="bg-gray-900/50 rounded-lg p-6 mb-8">
        <p className="text-lg text-gray-400">Player</p>
        <p className="text-2xl font-bold text-white mb-4">{score.name}</p>
        <p className="text-lg text-gray-400">Final Score</p>
        <p className="text-5xl font-bold text-yellow-400">{score.score} <span className="text-3xl text-gray-400">/ {totalQuestions}</span></p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onPlayAgain}
          className="px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-all duration-200 transform hover:scale-105"
        >
          Play Again
        </button>
        <button
          onClick={onShowLeaderboard}
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
        >
          View Leaderboard
        </button>
      </div>
      <div className="mt-4">
        <button
          onClick={onReviewAnswers}
          className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105 w-full sm:w-auto"
        >
          Review Answers
        </button>
      </div>
    </Card>
  );
};


// --- LeaderboardScreen Component ---
interface LeaderboardScreenProps {
    onBack: () => void;
}

const getRankEmoji = (rank: number) => {
    switch(rank) {
        case 0: return '🥇';
        case 1: return '🥈';
        case 2: return '🥉';
        default: return `${rank + 1}`;
    }
};

const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ onBack }) => {
  const [leaderboardData, setLeaderboardData] = useState<UserScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    quizService.getLeaderboard()
        .then(data => setLeaderboardData(data))
        .catch(console.error)
        .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6">🏆 Top 5 Winners 🏆</h1>
      {isLoading ? (
         <div className="text-center text-gray-400">Loading Leaderboard...</div>
      ) : (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
            <thead>
                <tr className="border-b border-gray-600">
                <th className="p-3 text-sm font-semibold text-gray-400">Rank</th>
                <th className="p-3 text-sm font-semibold text-gray-400">Name</th>
                <th className="p-3 text-sm font-semibold text-gray-400 text-right">Score</th>
                </tr>
            </thead>
            <tbody>
                {leaderboardData.map((user, index) => (
                <tr key={index} className="border-b border-gray-700/50 last:border-b-0 hover:bg-gray-700/50 transition-colors duration-200">
                    <td className="p-3 text-lg font-bold w-16">{getRankEmoji(index)}</td>
                    <td className="p-3 font-medium">{user.name}</td>
                    <td className="p-3 font-bold text-right text-yellow-400">{user.score}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      )}
       <div className="mt-8 text-center">
            <button
                onClick={onBack}
                className="px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700 transition-all duration-200 transform hover:scale-105"
            >
                Back to Start
            </button>
        </div>
    </Card>
  );
};

// --- ReviewScreen Component ---
interface ReviewScreenProps {
    questions: FullQuestion[];
    onBack: () => void;
}

const ReviewScreen: React.FC<ReviewScreenProps> = ({ questions, onBack }) => {
    const [explanations, setExplanations] = useState<Record<number, string>>({});
    const [isLoadingExplanation, setIsLoadingExplanation] = useState<Record<number, boolean>>({});
    
    const getOptionClass = (optionIndex: number, question: FullQuestion) => {
        const { correctAnswerIndex, userAnswerIndex } = question;
        if (optionIndex === correctAnswerIndex) {
            return 'bg-green-600/50 border-green-500';
        }
        if (optionIndex === userAnswerIndex) {
            return 'bg-red-600/50 border-red-500';
        }
        return 'bg-gray-700/50 border-gray-600';
    };

    const handleExplainMistake = async (qIndex: number) => {
        const question = questions[qIndex];
        if (!question || question.userAnswerIndex === question.correctAnswerIndex) return;

        setIsLoadingExplanation(prev => ({ ...prev, [qIndex]: true }));
        try {
            const result = await quizService.explainMistake(question);
            setExplanations(prev => ({ ...prev, [qIndex]: result.explanation }));
        } catch (error) {
            console.error(error);
            setExplanations(prev => ({ ...prev, [qIndex]: "Could not load an explanation at this time." }));
        } finally {
            setIsLoadingExplanation(prev => ({ ...prev, [qIndex]: false }));
        }
    };

    return (
        <div className="flex flex-col gap-6 w-full">
            <h1 className="text-3xl font-bold text-center mb-2">Answer Review</h1>
            {questions.map((q, qIndex) => (
                <Card key={qIndex} className="w-full">
                    {q.imageBase64 && (
                        <div className="mb-4 rounded-lg overflow-hidden">
                            <img 
                                src={`data:image/jpeg;base64,${q.imageBase64}`}
                                alt="Quiz context"
                                className="w-full h-auto max-h-60 object-contain"
                            />
                        </div>
                    )}
                    <h2 className="text-xl font-semibold mb-4"><span className="text-gray-400">{qIndex + 1}.</span> {q.question}</h2>
                    <div className="flex flex-col gap-2">
                        {q.options.map((option, oIndex) => (
                            <div key={oIndex} className={`p-3 rounded-lg border text-left ${getOptionClass(oIndex, q)}`}>
                                {option}
                            </div>
                        ))}
                    </div>
                    {q.userAnswerIndex !== null && q.userAnswerIndex !== q.correctAnswerIndex && (
                        <div className="mt-4 text-center">
                            {!explanations[qIndex] && !isLoadingExplanation[qIndex] && (
                                <button
                                    onClick={() => handleExplainMistake(qIndex)}
                                    className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    🤔 Explain My Mistake
                                </button>
                            )}
                            {isLoadingExplanation[qIndex] && <p className="text-gray-400">Generating explanation...</p>}
                            {explanations[qIndex] && (
                                <div className="p-4 mt-2 bg-gray-900/70 rounded-lg text-left text-gray-300">
                                    <p className="font-bold text-indigo-400 mb-2">Explanation:</p>
                                    <p className="whitespace-pre-wrap">{explanations[qIndex]}</p>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            ))}
            <div className="text-center mt-4">
                 <button
                    onClick={onBack}
                    className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
                >
                    Back to Results
                </button>
            </div>
        </div>
    );
};


// --- App Component ---
type View = 'login' | 'quiz' | 'results' | 'leaderboard' | 'review';

const App: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [sessionId, setSessionId] = useState<string>('');
  const [finalScore, setFinalScore] = useState<UserScore | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [quizReviewData, setQuizReviewData] = useState<FullQuestion[]>([]);

  const handleLogin = useCallback(async (name: string) => {
    // Hardcode defaults since the UI for selection was removed. This fixes the network error.
    const selectedDifficulty: Difficulty = 'Medium';
    const topic = 'General Knowledge';
    const visual = false;

    const { sessionId, totalQuestions } = await quizService.startQuiz(name, selectedDifficulty, topic, visual);
    setDifficulty(selectedDifficulty);
    setTotalQuestions(totalQuestions);
    setSessionId(sessionId);
    setView('quiz');
  }, []);

  const handleQuizEnd = useCallback(async (id: string) => {
    const { name, score, questions } = await quizService.endQuiz(id);
    setFinalScore({ name, score });
    setQuizReviewData(questions);
    setView('results');
  }, []);

  const handlePlayAgain = useCallback(() => {
    setSessionId('');
    setFinalScore(null);
    setTotalQuestions(0);
    setQuizReviewData([]);
    setView('login');
  }, []);

  const renderView = () => {
    switch (view) {
      case 'login':
        return <LoginScreen onLogin={handleLogin} />;
      case 'quiz':
        return <QuizScreen 
                    sessionId={sessionId} 
                    difficulty={difficulty} 
                    totalQuestions={totalQuestions}
                    onQuizEnd={handleQuizEnd} 
                />;
      case 'results':
        return finalScore && (
          <ResultsScreen 
            score={finalScore} 
            totalQuestions={totalQuestions}
            onPlayAgain={handlePlayAgain}
            onShowLeaderboard={() => setView('leaderboard')}
            onReviewAnswers={() => setView('review')}
          />
        );
      case 'leaderboard':
        return <LeaderboardScreen onBack={handlePlayAgain} />;
      case 'review':
        return <ReviewScreen questions={quizReviewData} onBack={() => setView('results')} />;
      default:
        return <LoginScreen onLogin={handleLogin} />;
    }
  };

  return (
    <main className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-blue-900/50 to-gray-900 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl">
        {renderView()}
      </div>
    </main>
  );
};


// --- App Mounting Logic ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
