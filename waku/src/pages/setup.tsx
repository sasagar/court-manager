import { SetupClient } from '../components/SetupClient';

export default async function SetupPage() {
  return <SetupClient />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
