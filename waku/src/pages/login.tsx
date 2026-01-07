import { LoginClient } from '../components/LoginClient';

export default async function LoginPage() {
  return <LoginClient />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
