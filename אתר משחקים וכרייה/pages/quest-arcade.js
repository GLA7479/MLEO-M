export default function QuestArcadeRedirect() {
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
