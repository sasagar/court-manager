import { ProfileClient } from '../components/ProfileClient';

export default async function ProfilePage() {
  return <ProfileClient />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
