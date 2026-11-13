import { addLayer, createDocument, createShapeLayer, createTextLayer } from '../editor/document';
import type { DocumentModel, Layer, ShapeKind, TextAlign } from '../types';

export interface BuiltinTemplate {
  id: string;
  name: string;
  category: string;
  /** Short description with the physical size. */
  description: string;
  build: () => DocumentModel;
}

interface TextOpts {
  size: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  font?: string;
  name?: string;
}

function text(t: string, x: number, y: number, w: number, o: TextOpts): Layer {
  return createTextLayer({
    text: t,
    x,
    y,
    width: w,
    fontSize: o.size,
    color: o.color ?? '#111111',
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    align: o.align ?? 'left',
    fontFamily: o.font ?? 'Arial',
    name: o.name ?? t.slice(0, 24),
    height: o.size * 1.2,
  });
}

function box(
  shape: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  o: { stroke?: string; strokeWidth?: number; radius?: number; name?: string } = {},
): Layer {
  return createShapeLayer(shape, {
    x,
    y,
    width: w,
    height: h,
    fill,
    stroke: o.stroke ?? null,
    strokeWidth: o.strokeWidth ?? 0,
    cornerRadius: o.radius ?? 0,
    name: o.name,
  });
}

function make(
  name: string,
  width: number,
  height: number,
  dpi: number,
  bg: string,
  layers: Layer[],
): DocumentModel {
  return layers.reduce((d, l) => addLayer(d, l), createDocument({ name, width, height, dpi, backgroundColor: bg }));
}

const idCard = (): DocumentModel =>
  make('ID Card', 1013, 638, 300, '#ffffff', [
    box('rect', 0, 0, 1013, 120, '#1e3a8a', { name: 'Header band' }),
    text('IDENTIFICATION CARD', 40, 36, 933, { size: 44, color: '#ffffff', bold: true, name: 'Title' }),
    box('rect', 40, 160, 270, 340, '#e5e7eb', { stroke: '#9ca3af', strokeWidth: 3, name: 'Photo area' }),
    text('PHOTO', 40, 310, 270, { size: 36, color: '#6b7280', align: 'center', name: 'Photo label' }),
    text('FULL NAME', 350, 170, 620, { size: 26, color: '#6b7280', name: 'Name label' }),
    text('Juan Dela Cruz', 350, 205, 620, { size: 44, bold: true, name: 'Name' }),
    text('ID NUMBER', 350, 290, 620, { size: 26, color: '#6b7280', name: 'ID label' }),
    text('0000-0000-0000', 350, 325, 620, { size: 40, name: 'ID number' }),
    text('VALID UNTIL', 350, 410, 620, { size: 26, color: '#6b7280', name: 'Valid label' }),
    text('12 / 2030', 350, 445, 620, { size: 40, name: 'Valid date' }),
    box('rect', 0, 598, 1013, 40, '#1e3a8a', { name: 'Footer band' }),
  ]);

const businessCard = (): DocumentModel =>
  make('Business Card', 1050, 600, 300, '#ffffff', [
    box('rect', 0, 0, 40, 600, '#0f766e', { name: 'Accent bar' }),
    text('Your Name', 90, 90, 800, { size: 72, bold: true, name: 'Name' }),
    text('Job Title', 90, 185, 800, { size: 38, color: '#0f766e', name: 'Title' }),
    box('rect', 90, 260, 160, 6, '#0f766e', { name: 'Divider' }),
    text('+63 900 000 0000', 90, 320, 800, { size: 34, name: 'Phone' }),
    text('you@example.com', 90, 375, 800, { size: 34, name: 'Email' }),
    text('Your Company · City, Country', 90, 430, 800, { size: 34, color: '#4b5563', name: 'Address' }),
  ]);

const certificate = (): DocumentModel =>
  make('Certificate', 1754, 1240, 150, '#fffdf5', [
    box('rect', 40, 40, 1674, 1160, null, { stroke: '#b45309', strokeWidth: 14, name: 'Outer border' }),
    box('rect', 75, 75, 1604, 1090, null, { stroke: '#b45309', strokeWidth: 4, name: 'Inner border' }),
    text('CERTIFICATE', 100, 200, 1554, { size: 120, bold: true, color: '#92400e', align: 'center', font: 'Georgia', name: 'Title' }),
    text('OF ACHIEVEMENT', 100, 340, 1554, { size: 56, color: '#92400e', align: 'center', font: 'Georgia', name: 'Subtitle' }),
    text('This certificate is proudly presented to', 100, 480, 1554, { size: 40, align: 'center', italic: true, font: 'Georgia', name: 'Presented to' }),
    text('Recipient Name', 100, 570, 1554, { size: 96, bold: true, align: 'center', font: 'Brush Script MT', color: '#111827', name: 'Recipient' }),
    text('in recognition of outstanding effort and dedication.', 100, 730, 1554, { size: 40, align: 'center', font: 'Georgia', name: 'Reason' }),
    box('line', 300, 1000, 450, 4, null, { name: 'Signature line 1' }),
    box('line', 1004, 1000, 450, 4, null, { name: 'Signature line 2' }),
    text('Signature', 300, 1015, 450, { size: 30, align: 'center', color: '#4b5563', name: 'Signature label' }),
    text('Date', 1004, 1015, 450, { size: 30, align: 'center', color: '#4b5563', name: 'Date label' }),
  ]);

const poster = (): DocumentModel =>
  make('Poster', 1650, 2550, 150, '#0f172a', [
    box('rect', 0, 0, 1650, 900, '#2563eb', { name: 'Header block' }),
    text('BIG EVENT', 100, 250, 1450, { size: 240, bold: true, color: '#ffffff', font: 'Impact', name: 'Headline' }),
    text('Saturday · 7 PM', 100, 640, 1450, { size: 90, color: '#bfdbfe', name: 'When' }),
    box('ellipse', 1000, 1100, 500, 500, '#f59e0b', { name: 'Accent circle' }),
    text('Join us for an unforgettable night of music, food and fun.', 100, 1100, 800, { size: 70, color: '#e2e8f0', name: 'Description' }),
    text('Venue Name, City', 100, 2250, 1450, { size: 64, bold: true, color: '#ffffff', name: 'Venue' }),
    text('www.example.com', 100, 2350, 1450, { size: 50, color: '#94a3b8', name: 'Website' }),
  ]);

const invitation = (): DocumentModel =>
  make('Invitation', 1500, 2100, 300, '#fff7f5', [
    box('rect', 60, 60, 1380, 1980, null, { stroke: '#be123c', strokeWidth: 8, name: 'Border' }),
    text("You're Invited", 150, 330, 1200, { size: 150, align: 'center', font: 'Brush Script MT', color: '#be123c', name: 'Heading' }),
    text('to the birthday party of', 150, 650, 1200, { size: 60, align: 'center', italic: true, font: 'Georgia', name: 'Intro' }),
    text('Maria', 150, 780, 1200, { size: 200, bold: true, align: 'center', font: 'Georgia', color: '#111827', name: 'Celebrant' }),
    box('line', 550, 1120, 400, 4, null, { name: 'Divider' }),
    text('Saturday, 15 June · 3:00 PM', 150, 1200, 1200, { size: 64, align: 'center', name: 'When' }),
    text('Garden Hall, Cebu City', 150, 1320, 1200, { size: 56, align: 'center', color: '#4b5563', name: 'Where' }),
    text('RSVP: 0900 000 0000', 150, 1750, 1200, { size: 50, align: 'center', color: '#be123c', name: 'RSVP' }),
  ]);

const socialPost = (): DocumentModel =>
  make('Social Media Post', 1080, 1080, 72, '#fde68a', [
    box('rect', 60, 60, 960, 960, '#ffffff', { radius: 40, name: 'Card' }),
    box('ellipse', 760, 100, 220, 220, '#f59e0b', { name: 'Accent circle' }),
    text('Big Announcement', 120, 340, 840, { size: 110, bold: true, color: '#111827', name: 'Headline' }),
    text('Add your message here. Keep it short and bold.', 120, 650, 840, { size: 48, color: '#4b5563', name: 'Message' }),
    text('@yourhandle', 120, 900, 840, { size: 40, bold: true, color: '#d97706', name: 'Handle' }),
  ]);

const profilePicture = (): DocumentModel =>
  make('Profile Picture', 800, 800, 72, '#1e293b', [
    box('ellipse', 60, 60, 680, 680, '#334155', { stroke: '#38bdf8', strokeWidth: 16, name: 'Ring' }),
    text('YN', 60, 280, 680, { size: 240, bold: true, color: '#e2e8f0', align: 'center', name: 'Initials' }),
  ]);

const productAd = (): DocumentModel =>
  make('Product Advertisement', 1080, 1350, 72, '#f1f5f9', [
    box('rect', 80, 80, 920, 700, '#cbd5e1', { radius: 30, name: 'Product area' }),
    text('PRODUCT PHOTO', 80, 400, 920, { size: 56, color: '#64748b', align: 'center', name: 'Product label' }),
    text('NEW ARRIVAL', 80, 850, 920, { size: 100, bold: true, color: '#0f172a', name: 'Headline' }),
    text('Describe your product in one short line.', 80, 980, 920, { size: 46, color: '#475569', name: 'Description' }),
    box('ellipse', 760, 920, 240, 240, '#dc2626', { name: 'Price badge' }),
    text('₱499', 760, 995, 240, { size: 80, bold: true, color: '#ffffff', align: 'center', name: 'Price' }),
    text('Order now · www.example.com', 80, 1230, 920, { size: 42, bold: true, color: '#0f172a', name: 'Call to action' }),
  ]);

const logo = (): DocumentModel =>
  make('Basic Logo', 1000, 1000, 300, '#ffffff', [
    box('ellipse', 250, 120, 500, 500, '#7c3aed', { name: 'Emblem' }),
    text('B', 250, 215, 500, { size: 340, bold: true, color: '#ffffff', align: 'center', font: 'Georgia', name: 'Monogram' }),
    text('BRAND NAME', 100, 700, 800, { size: 110, bold: true, color: '#1f2937', align: 'center', name: 'Wordmark' }),
    text('YOUR TAGLINE HERE', 100, 840, 800, { size: 44, color: '#7c3aed', align: 'center', name: 'Tagline' }),
  ]);

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { id: 'id-card', name: 'ID Card', category: 'ID Cards', description: 'CR80 card, 3.375 × 2.125 in', build: idCard },
  { id: 'business-card', name: 'Business Card', category: 'Business Cards', description: '3.5 × 2 in', build: businessCard },
  { id: 'certificate', name: 'Certificate', category: 'Certificates', description: 'A4 landscape (150 dpi)', build: certificate },
  { id: 'poster', name: 'Event Poster', category: 'Posters', description: '11 × 17 in (150 dpi)', build: poster },
  { id: 'invitation', name: 'Invitation', category: 'Invitations', description: '5 × 7 in', build: invitation },
  { id: 'social-post', name: 'Social Post', category: 'Social Media Posts', description: '1080 × 1080 px', build: socialPost },
  { id: 'profile-picture', name: 'Profile Picture', category: 'Profile Pictures', description: '800 × 800 px', build: profilePicture },
  { id: 'product-ad', name: 'Product Ad', category: 'Product Advertisements', description: '1080 × 1350 px', build: productAd },
  { id: 'logo', name: 'Basic Logo', category: 'Logo Designs', description: '1000 × 1000 px', build: logo },
];

export function builtinById(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
