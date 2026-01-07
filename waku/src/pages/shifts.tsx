import { ShiftsPageClient } from '../components/ShiftsPageClient';

export default async function ShiftsPage() {
  return <ShiftsPageClient />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
