// A template's shape: the icon a card shows on its meeting.
import { Briefcase, Car, ClipboardCheck, FileText, MapPin, Phone, Shield, Star, User, Users, UtensilsCrossed, Video, type LucideIcon } from "lucide-react";
import type { Shape } from "@/domain/cards";

const ICONS: Record<Shape, LucideIcon> = {
  phone: Phone, user: User, users: Users, video: Video, "map-pin": MapPin, "file-text": FileText,
  "clipboard-check": ClipboardCheck, briefcase: Briefcase, car: Car, utensils: UtensilsCrossed, shield: Shield, star: Star,
};

export function ShapeIcon({ shape, className }: { shape: string | undefined; className?: string }) {
  const Icon = ICONS[shape as Shape] ?? Star;
  return <Icon aria-hidden className={className} />;
}
