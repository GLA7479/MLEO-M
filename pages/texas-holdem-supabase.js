import TexasHoldemSupabasePage from '../game/mleo-texas-holdem-supabase';

export default function TexasHoldemSupabaseGamePage() {
  return <TexasHoldemSupabasePage />;
}

// Add getStaticProps to fix Next.js error
export async function getStaticProps() {
  return {
    props: {},
  };
}
