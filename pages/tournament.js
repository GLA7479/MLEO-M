import CardRoomsPage from "../game/mleo-texas-holdem-casino";

export default function Tournament() {
  return <CardRoomsPage />;
}

export async function getStaticProps() {
  return {
    props: {},
  };
}
