export default function TournamentRedirect() {
  return null;
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/arcade",
      permanent: false,
    },
  };
}
