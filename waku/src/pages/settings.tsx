import { SettingsClient } from '../components/SettingsClient';

export default async function SettingsPage() {
  return <SettingsClient />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
