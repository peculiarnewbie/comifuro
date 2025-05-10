import { Metadata } from "~/routes";

export default function Tweet(props: { tweet: [string, Metadata] }) {
    const data: () => Metadata = () => {
        return props.tweet[1];
    };
    return (
        <div class=" p-2">
            {/* <div class="grid grid-cols-2 gap-4">
                {data().images.map((i) => (
                    <div class="w-full h-full">
                        <img
                            class="w-full h-full object-contain"
                            src={`https://r2.comifuro.peculiarnewbie.com/${props.tweet[0]}${i}`}
                        />
                    </div>
                ))}
            </div> */}
            <div class="overflow-hidden">
                <img
                    class="w-full h-full object-cover"
                    src={`https://r2.comifuro.peculiarnewbie.com/${props.tweet[0]}0`}
                    loading="lazy"
                />
            </div>
            {/* <h1>{props.tweet[0]}</h1> */}
            <h3 class="text-sm">{data().user}</h3>
            <p class="text-xs">{data().text}</p>
        </div>
    );
}
