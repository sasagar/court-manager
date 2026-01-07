import { PublicViewClient } from '../../components/PublicViewClient';

type Props = {
  token: string;
};

export default async function PublicViewPage({ token }: Props) {
  return <PublicViewClient token={token} />;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
