import TexasHoldemSupabasePage from '../game/mleo-texas-holdem-supabase-try';

export default function TexasHoldemSupabaseGamePage() {
  return <TexasHoldemSupabasePage />;
}

// Add getStaticProps to fix Next.js error
export async function getStaticProps() {
  return {
    props: {},
  };
}
