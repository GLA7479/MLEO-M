import TexasHoldemCasinoPage from "../game/mleo-texas-holdem-casino";

export default function Tournament() {
  return <TexasHoldemCasinoPage />;
}

export async function getStaticProps() {
  return {
    props: {},
  };
}
