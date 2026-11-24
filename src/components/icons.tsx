import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleUser,
  Cylinder,
  Droplet,
  Fuel,
  House,
  Image as LucideImage,
  Link as LucideLink,
  Gauge,
  Maximize2,
  Minimize2,
  Pencil,
  Route,
  ScanLine,
  Search,
  Share2,
  Smartphone,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The app's icon set: Lucide icons with one shared size and stroke, so every
 * screen draws icons the same way. Import from here, not from lucide-react
 * directly, so the defaults stay consistent.
 */
type IconProps = { className?: string; size?: number; strokeWidth?: number };

function make(Icon: LucideIcon, name: string) {
  function AppIcon({ className, size = 20, strokeWidth = 1.8 }: IconProps) {
    return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />;
  }
  AppIcon.displayName = name;
  return AppIcon;
}

export const FuelPumpIcon = make(Fuel, 'FuelPumpIcon');
export const DropletIcon = make(Droplet, 'DropletIcon');
export const GasCylinderIcon = make(Cylinder, 'GasCylinderIcon');
export const CheckIcon = make(Check, 'CheckIcon');
export const CheckCircleIcon = make(CircleCheck, 'CheckCircleIcon');
export const AlertCircleIcon = make(CircleAlert, 'AlertCircleIcon');
export const AlertTriangleIcon = make(TriangleAlert, 'AlertTriangleIcon');
export const ExpandIcon = make(Maximize2, 'ExpandIcon');
export const CollapseIcon = make(Minimize2, 'CollapseIcon');
export const ChevronDownIcon = make(ChevronDown, 'ChevronDownIcon');
export const ChevronRightIcon = make(ChevronRight, 'ChevronRightIcon');
export const ArrowLeftIcon = make(ArrowLeft, 'ArrowLeftIcon');
export const PencilIcon = make(Pencil, 'PencilIcon');
export const TrashIcon = make(Trash2, 'TrashIcon');
export const UserPlusIcon = make(UserPlus, 'UserPlusIcon');
export const LinkIcon = make(LucideLink, 'LinkIcon');
export const CameraIcon = make(Camera, 'CameraIcon');
export const ImageIcon = make(LucideImage, 'ImageIcon');
export const FlashIcon = make(Zap, 'FlashIcon');
export const SearchIcon = make(Search, 'SearchIcon');
export const HomeIcon = make(House, 'HomeIcon');
export const ScanIcon = make(ScanLine, 'ScanIcon');
export const TripsIcon = make(Route, 'TripsIcon');
export const GaugeIcon = make(Gauge, 'GaugeIcon');
export const UsersIcon = make(Users, 'UsersIcon');
export const WalletIcon = make(Wallet, 'WalletIcon');
export const ProfileIcon = make(CircleUser, 'ProfileIcon');
export const ShareIcon = make(Share2, 'ShareIcon');
export const CloseIcon = make(X, 'CloseIcon');
export const PhoneIcon = make(Smartphone, 'PhoneIcon');

/** A filled "verified" badge: this person has signed in to Paytrol. */
export function VerifiedIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return <BadgeCheck size={size} fill="currentColor" stroke="white" strokeWidth={2} className={className} aria-hidden="true" />;
}

export const FUEL_TYPE_ICONS = {
  petrol: FuelPumpIcon,
  diesel: DropletIcon,
  cng: GasCylinderIcon,
} as const;
