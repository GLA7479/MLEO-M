import TournamentPage from "../game/mleo-tournament";

export default function Tournament() {
  return <TournamentPage />;
}

export async function getStaticProps() {
  return {
    props: {},
  };
}
