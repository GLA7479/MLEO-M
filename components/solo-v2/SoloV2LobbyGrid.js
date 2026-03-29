import SoloV2LobbyCard from "./SoloV2LobbyCard";

export default function SoloV2LobbyGrid({ games }) {
  return (
    <section className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-2 lg:gap-1.5" aria-label="Solo V2 games">
      {games.map((game) => (
        <SoloV2LobbyCard key={game.gameKey || game.key} game={game} />
      ))}
    </section>
  );
}
