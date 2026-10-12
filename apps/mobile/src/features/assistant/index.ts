// Point d'entrée public de la feature « assistant » (lot L9). Exporter ici uniquement ce que les écrans
// et les autres features peuvent utiliser.
export { assistantApi } from './api';
export {
  LATE_AFTER_MS,
  chatReducer,
  failureOf,
  initialState,
  isLate,
  isSending,
  mergeMessages,
  pendingAnswers,
  pollDelay,
  questionProblem,
  showCounter,
  type ChatState,
  type OutgoingQuestion,
  type SendFailure,
} from './conversation';
export {
  KIND_PRESENTATION,
  SOURCE_STATUS,
  SUGGESTIONS,
  emergencyCalls,
  telUri,
  type EmergencyCall,
} from './presentation';
export {
  mergePage,
  parseSheetBody,
  reviewOf,
  spansOf,
  whenLabel,
  type ReviewLabel,
  type SheetBlock,
  type Span,
  type WhenLabel,
} from './library';
export { useConversation } from './useConversation';
export {
  useConversationList,
  useSheet,
  useSheetList,
  type LoadStatus,
  type RemoveResult,
} from './useLibrary';
export { useEmergencyCalls } from './useEmergencyCalls';
export { AssistantEntryCard } from './components/AssistantEntryCard';
export { AnswerBubble, OutgoingBubble, PendingBubble, QuestionBubble } from './components/Bubbles';
export { ChatHeader } from './components/ChatHeader';
export { Composer } from './components/Composer';
export { EmergencyPanel } from './components/EmergencyPanel';
export { Welcome } from './components/Welcome';
export {
  BackLink,
  ConfirmBox,
  ConversationRow,
  ReviewBadge,
  SheetBody,
  SheetRow,
  useWhen,
} from './components/Library';
