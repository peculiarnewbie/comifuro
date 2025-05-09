export default function Tweet(props: { tweet: [string, string] }) {
    console.log(props);
    const data: () => {
        user: string;
        text: string;
        url: string;
        images: number[];
    } = () => {
        return JSON.parse(props.tweet[1]);
    };
    return (
        <div>
            <h1>{props.tweet[0]}</h1>
            <h3>{data().user}</h3>
            <p>{data().text}</p>
            <div class="grid grid-cols-2 gap-4 max-h-[720]">
                {data().images.map((i) => (
                    <div class="w-full h-full">
                        <img
                            class="w-full h-full object-contain"
                            src={`https://r2.comifuro.peculiarnewbie.com/${props.tweet[0]}${i}`}
                        />
                    </div>
                ))}
            </div>
            <p>{JSON.stringify(data().images)}</p>
        </div>
    );
}
