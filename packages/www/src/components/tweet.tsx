import type { Metadata } from "../routes/index";

export default function Tweet(props: {
    tweet: [string, Metadata];
    // onImageLoad: () => void;
}) {
    const data: () => Metadata = () => {
        return props.tweet[1];
    };
    return (
        <div class="p-2 tweet">
            <div class="overflow-hidden">
                <img
                    class="object-cover"
                    src={`https://r2.comifuro.peculiarnewbie.com/${props.tweet[0]}0`}
                    loading="lazy"
                    // onload={() => {
                    //     console.log("loaded");
                    //     props.onImageLoad();
                    // }}
                />
            </div>
            {/* <h1>{props.tweet[0]}</h1> */}
            <h3 class="text-sm">{data().user}</h3>
            <p class="text-xs">{data().text}</p>
        </div>
    );
}
