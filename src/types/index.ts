// User profile stored in Cosmos DB
export interface UserProfile {
  id: string;              // Google UID
  email: string;
  displayName: string;
  photoURL: string | null;
  defaultFuelType: 'petrol' | 'diesel' | 'cng';
  currency: string;        // e.g. "INR"
  lastFuelPrice: number;
  createdAt: string;       // ISO date
  updatedAt: string;
}

// AI extraction result from dashboard photo
export interface ExtractionResult {
  distanceKm: number;
  avgMileageKmpl: number;
  confidenceDistance: 'high' | 'medium' | 'low';
  confidenceMileage: 'high' | 'medium' | 'low';
  rawText?: string;
}

// Friendship / invite
export interface Friendship {
  id: string;
  fromUid: string;
  fromName: string;
  fromEmail: string;
  fromPhoto: string | null;
  toUid: string | null;    // null if invitee hasn't signed up yet
  toEmail: string;
  toName: string | null;
  toPhoto: string | null;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

// A single trip record
export interface Trip {
  id: string;
  creatorUid: string;
  creatorName: string;
  photoURL: string;
  distanceKm: number;
  avgMileageKmpl: number;
  fuelPricePerLiter: number;
  fuelUsedLiters: number;
  totalCost: number;
  splitMode: 'equal' | 'custom';
  participants: TripParticipant[];
  createdAt: string;
}

// Participant in a trip
export interface TripParticipant {
  uid: string;
  guestContactId?: string;
  displayName: string;
  photoURL: string | null;
  isGuest?: boolean;
  shareAmount: number;
  customPercentage: number | null;
  settled: boolean;
  settledAt: string | null;
}

export interface GuestContact {
  id: string;
  ownerUid: string;
  guestUid: string;
  name: string;
  email: string | null;
  linkedUid: string | null;
  createdAt: string;
  updatedAt: string;
}

// Net balance between two users
export interface Balance {
  id: string;              // Cosmos DB document id (composite: uid1_uid2)
  odataId: string;
  uid1: string;
  uid2: string;
  name1: string;
  name2: string;
  photo1: string | null;
  photo2: string | null;
  netAmount: number;       // positive = uid1 owes uid2
  guestUid?: string;
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Trip creation form state
export interface TripFormState {
  photoFile: File | null;
  photoPreviewUrl: string | null;
  extraction: ExtractionResult | null;
  distanceKm: number;
  avgMileageKmpl: number;
  fuelPricePerLiter: number;
  fuelUsedLiters: number;
  totalCost: number;
  selectedFriends: string[];
  includeMe: boolean;
  splitMode: 'equal' | 'custom';
  customSplits: Record<string, number>;
}
