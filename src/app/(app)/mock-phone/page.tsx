import { requireCurrentClient } from '@/lib/client';
import { MockPhoneClient, type Persona } from './mock-phone-client';

export const dynamic = 'force-dynamic';

// Persona set per vertical. Real-estate operators want to test buyer
// flows (budget extraction, viewing requests, payment-plan inquiries),
// so we substitute KSA / Dubai / NRI investor archetypes with opener
// messages they can copy-paste straight in.
const CLINIC_PERSONAS: Persona[] = [
  { name: 'Ahmed', phone: '+971501111111' },
  { name: 'Fatima', phone: '+971502222222' },
  { name: 'Omar', phone: '+971503333333' },
];

const REAL_ESTATE_PERSONAS: Persona[] = [
  {
    name: 'Mohammed (KSA buyer)',
    phone: '+971501111111',
    opener: 'السلام عليكم، أبغى شقة في الرياض ميزانيتي ١.٥ مليون',
  },
  {
    name: 'Anastasia (Russian investor)',
    phone: '+971502222222',
    opener:
      'Hi, looking for investment property in Dubai Marina, around 2M AED, off-plan preferred',
  },
  {
    name: 'Rajesh (NRI investor)',
    phone: '+971503333333',
    opener:
      "Hello, I'm interested in JVC apartments under 1.5M, payment plan 50/50",
  },
];

export default async function MockPhonePage() {
  const client = await requireCurrentClient();
  const personas =
    client.client_type === 'real_estate' ? REAL_ESTATE_PERSONAS : CLINIC_PERSONAS;

  return <MockPhoneClient personas={personas} clientType={client.client_type} />;
}
