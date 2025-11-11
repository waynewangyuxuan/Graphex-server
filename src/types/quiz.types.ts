/**
 * Quiz-related Type Definitions
 */

/**
 * Quiz difficulty levels
 */
export enum QuizDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/**
 * Quiz question option
 */
export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

/**
 * Quiz question
 */
export interface QuizQuestion {
  id: string;
  questionText: string;
  options: QuizOption[];
  explanation: string;
  difficulty: QuizDifficulty;
}

/**
 * Quiz generation request
 */
export interface QuizGenerateRequest {
  graphId: string;
  questionCount?: number;
}

/**
 * Quiz generation response
 */
export interface QuizGenerateResponse {
  quizId: string;
  graphId: string;
  questions: QuizQuestion[];
}

/**
 * Quiz submission answer
 */
export interface QuizAnswer {
  questionId: string;
  selectedOptionIndex: number;
}

/**
 * Quiz submission request
 */
export interface QuizSubmitRequest {
  answers: QuizAnswer[];
}

/**
 * Quiz result
 */
export interface QuizResult {
  questionId: string;
  correct: boolean;
  selectedAnswer: number;
  correctAnswer: number;
  explanation: string;
}

/**
 * Quiz submission response
 */
export interface QuizSubmitResponse {
  score: number;
  totalQuestions: number;
  results: QuizResult[];
}
