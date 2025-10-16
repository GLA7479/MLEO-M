import TexasHoldemMultiplayerPage from '../game/mleo-texas-holdem-multiplayer';

export default function TexasHoldemMultiplayerGamePage() {
  return <TexasHoldemMultiplayerPage />;
}

// Add getStaticProps to fix Next.js error
export async function getStaticProps() {
  return {
    props: {},
  };
}

