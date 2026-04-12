/**
 * Review Store - Alpine.js store for vocabulary review state management.
 *
 * Provides centralized state management for the review interface including
 * current word, progress tracking, timer, and UI state.
 *
 * @license Unlicense <http://unlicense.org/>
 * @since   3.0.0
 */

import Alpine from 'alpinejs';
import { ReviewApi } from '@modules/review/api/review_api';

/**
 * Language settings for the review.
 */
export interface LangSettings {
  name: string;
  dict1Uri: string;
  dict2Uri: string;
  translateUri: string;
  textSize: number;
  rtl: boolean;
  langCode: string;
}

/**
 * Current word being reviewed.
 */
export interface ReviewWord {
  wordId: number;
  text: string;
  translation: string;
  romanization: string;
  status: number;
  sentence: string;
  solution: string;
  group: string;
}

/**
 * Review progress tracking.
 */
export interface ReviewProgress {
  total: number;
  remaining: number;
  wrong: number;
  correct: number;
}

/**
 * Timer state.
 */
export interface ReviewTimer {
  startTime: number;
  serverTime: number;
  elapsed: string;
  intervalId: number | null;
}

/**
 * Review configuration from server.
 */
export interface ReviewConfig {
  reviewKey: string;
  selection: string;
  reviewType: number;
  isTableMode: boolean;
  wordMode: boolean;
  langId: number;
  error?: string;
  wordRegex: string;
  langSettings: LangSettings;
  progress: ReviewProgress;
  timer: {
    startTime: number;
    serverTime: number;
  };
  title: string;
  property: string;
}

/**
 * Review store state interface.
 */
export interface ReviewStoreState {
  // Review configuration
  reviewKey: string;
  selection: string;
  reviewType: number;
  isTableMode: boolean;
  wordMode: boolean;
  langId: number;
  wordRegex: string;
  property: string;
  title: string;

  // Language settings
  langSettings: LangSettings;

  // Current word being reviewed
  currentWord: ReviewWord | null;

  // Progress tracking
  progress: ReviewProgress;

  // UI state
  isLoading: boolean;
  isFinished: boolean;
  answerRevealed: boolean;
  isModalOpen: boolean;
  readAloudEnabled: boolean;
  tomorrowCount: number;
  error: string | null;
  isInitialized: boolean;

  // Methods
  configure(config: ReviewConfig): void;
  nextWord(): Promise<void>;
  revealAnswer(): void;
  updateStatus(status: number, isCorrect?: boolean): Promise<void>;
  incrementStatus(): Promise<void>;
  decrementStatus(): Promise<void>;
  skipWord(): Promise<void>;
  getDictUrl(which: 'dict1' | 'dict2' | 'translator'): string;
  hasDictUrl(which: 'dict1' | 'dict2' | 'translator'): boolean;
  getEditUrl(): string;
  openModal(): void;
  closeModal(): void;
  playSound(correct: boolean): void;
  setReadAloud(enabled: boolean): void;
}

/**
 * Calculate new status based on current status and change direction.
 */
function calculateNewStatus(currentStatus: number, change: number): number {
  let newStatus = currentStatus + change;

  // Clamp to valid range (1-5)
  if (newStatus < 1) newStatus = 1;
  if (newStatus > 5) newStatus = 5;

  return newStatus;
}

/**
 * Initial values that can be set before store creation.
 */
interface ReviewStoreInitialValues {
  reviewType?: number;
  isTableMode?: boolean;
}
interface WordTestDataWithStatus {
  term_id: number | string;
  solution?: string;
  term_text: string;
  group: string;
  status?: number; // Добавляем статус как опциональное поле
}
/**
 * Create the review store data object.
 */
function createReviewStore(initialValues?: ReviewStoreInitialValues): ReviewStoreState {
  const store: ReviewStoreState = {
    // Review configuration
    reviewKey: '',
    selection: '',
    reviewType: initialValues?.reviewType ?? 1,
    isTableMode: initialValues?.isTableMode ?? false,
    wordMode: false,
    langId: 0,
    wordRegex: '',
    property: '',
    title: '',

    // Language settings
    langSettings: {
      name: '',
      dict1Uri: '',
      dict2Uri: '',
      translateUri: '',
      textSize: 100,
      rtl: false,
      langCode: ''
    },

    // Current word being reviewed
    currentWord: null,

    // Progress tracking
    progress: {
      total: 0,
      remaining: 0,
      wrong: 0,
      correct: 0
    },

    // UI state
    isLoading: false,
    isFinished: false,
    answerRevealed: false,
    isModalOpen: false,
    readAloudEnabled: false,
    tomorrowCount: 0,
    error: null,
    isInitialized: false,

    // ===== МЕТОДЫ =====

    configure(config: ReviewConfig): void {
      this.reviewKey = config.reviewKey;
      this.selection = config.selection;
      this.reviewType = config.reviewType;
      this.isTableMode = config.isTableMode;
      this.wordMode = config.wordMode;
      this.langId = config.langId;
      this.wordRegex = config.wordRegex;
      this.property = config.property;
      this.title = config.title;
      this.langSettings = config.langSettings;
      this.progress = { ...config.progress };


      const savedReadAloud = localStorage.getItem('lwt-review-read-aloud');
      if (savedReadAloud !== null) {
        this.readAloudEnabled = savedReadAloud === 'true';
      }

      this.isInitialized = true;

    },

    async nextWord(): Promise<void> {
      if (this.isLoading) return;

      this.isLoading = true;
      this.answerRevealed = false;
      this.currentWord = null;
      this.error = null;

      try {
        const response = await ReviewApi.getNextWord({
          reviewKey: this.reviewKey,
          selection: this.selection,
          wordMode: this.wordMode,
          lgId: this.langId,
          wordRegex: this.wordRegex,
          type: this.reviewType
        });

        if (response.error) {
          this.error = response.error;
          this.isLoading = false;
          return;
        }

        if (!response.data || response.data.term_id === 0) {
          this.isFinished = true;
          this.stopTimer();

          const tomorrowResponse = await ReviewApi.getTomorrowCount(
            this.reviewKey,
            this.selection
          );
          if (tomorrowResponse.data?.count) {
            this.tomorrowCount = tomorrowResponse.data.count;
          }
        } else {
          const data = response.data as WordTestDataWithStatus;
          console.log('Word data from API:', data);  // ← что возвращает API?
          console.log('Status:', data.status);
          this.currentWord = {
            wordId: typeof data.term_id === 'string'
              ? parseInt(data.term_id, 10)
              : data.term_id,
            text: data.term_text,
            translation: '',
            romanization: '',
            status: data.status ?? 1,
            sentence: '',
            solution: data.solution || '',
            group: data.group
          };
        }
      } catch (err) {
        console.error('Error fetching next word:', err);
        this.error = 'Failed to load next word';
      }

      this.isLoading = false;
    },

    revealAnswer(): void {
      if (this.answerRevealed || !this.currentWord) return;
      this.answerRevealed = true;
    },

    async updateStatus(status: number, isCorrect: boolean = true): Promise<void> {
      if (!this.currentWord || this.isLoading) return;

      this.isLoading = true;
      this.error = null;

      try {
        const response = await ReviewApi.updateStatus(
          this.currentWord.wordId,
          status
        );

        if (response.error) {
          this.error = response.error;
          this.isLoading = false;
          return;
        }

        if (this.progress.remaining > 0) {
          this.progress.remaining--;
        }

        if (isCorrect) {
          this.progress.correct++;
        } else {
          this.progress.wrong++;
        }

        this.playSound(isCorrect);

        if (this.progress.remaining === 0) {
          this.isFinished = true;
          this.stopTimer();

          const tomorrowResponse = await ReviewApi.getTomorrowCount(
            this.reviewKey,
            this.selection
          );
          if (tomorrowResponse.data?.count) {
            this.tomorrowCount = tomorrowResponse.data.count;
          }

          this.currentWord = null;
          this.isLoading = false;
          return;
        }

        this.isLoading = false;
        await this.nextWord();

      } catch (err) {
        console.error('Error updating status:', err);
        this.error = 'Failed to update status';
        this.isLoading = false;
      }
    },

    async incrementStatus(): Promise<void> {
      if (!this.currentWord || !this.answerRevealed) return;
      const newStatus = calculateNewStatus(this.currentWord.status, 1);
      await this.updateStatus(newStatus, true);
    },

    async decrementStatus(): Promise<void> {
      if (!this.currentWord || !this.answerRevealed) return;
      const newStatus = calculateNewStatus(this.currentWord.status, -1);
      await this.updateStatus(newStatus, false);
    },

    async skipWord(): Promise<void> {
      if (!this.currentWord || this.isLoading) return;
      await this.updateStatus(this.currentWord.status);
    },

    getDictUrl(which: 'dict1' | 'dict2' | 'translator'): string {
      if (!this.currentWord) return '#';
      let template = '';
      switch (which) {
        case 'dict1': template = this.langSettings.dict1Uri; break;
        case 'dict2': template = this.langSettings.dict2Uri; break;
        case 'translator': template = this.langSettings.translateUri; break;
      }
      if (!template) return '#';
      return template.replace('lwt_term', encodeURIComponent(this.currentWord.text));
    },

    hasDictUrl(which: 'dict1' | 'dict2' | 'translator'): boolean {
      switch (which) {
        case 'dict1': return !!this.langSettings.dict1Uri;
        case 'dict2': return !!this.langSettings.dict2Uri;
        case 'translator': return !!this.langSettings.translateUri;
      }
    },

    getEditUrl(): string {
      if (!this.currentWord) return '#';
      return `/word/edit-term?wid=${this.currentWord.wordId}`;
    },

    openModal(): void {
      this.isModalOpen = true;
    },

    closeModal(): void {
      this.isModalOpen = false;
    },

    playSound(correct: boolean): void {
      const soundId = correct ? 'success_sound' : 'failure_sound';
      const audio = document.getElementById(soundId) as HTMLAudioElement | null;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => { });
      }
    },

    setReadAloud(enabled: boolean): void {
      this.readAloudEnabled = enabled;
      localStorage.setItem('lwt-review-read-aloud', String(enabled));
    }
  };

  return store;
}

/**
 * Initialize the review store as an Alpine.js store.
 *
 * @param initialValues Optional initial values to set before Alpine renders
 */
export function initReviewStore(initialValues?: ReviewStoreInitialValues): void {
  Alpine.store('review', createReviewStore(initialValues));
}

/**
 * Get the review store instance.
 */
export function getReviewStore(): ReviewStoreState {
  return Alpine.store('review') as ReviewStoreState;
}

/**
 * Check if the review store has been initialized.
 */
export function isReviewStoreInitialized(): boolean {
  try {
    return Alpine.store('review') !== undefined;
  } catch {
    return false;
  }
}

// Register the store with defaults (will be re-initialized with config in initReviewApp)
initReviewStore();

// Expose for global access
declare global {
  interface Window {
    getReviewStore: typeof getReviewStore;
  }
}

window.getReviewStore = getReviewStore;
