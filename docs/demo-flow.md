# The Decision Room: your experiment journey

**AI does not make the call. You do.**

Start with your own judgment, compare it with AI, then decide what deserves a second look.

```mermaid
flowchart TB
    subgraph core["CORE EXPERIMENT | 8-10 minutes"]
        A["1. Choose a decision<br/>AI in customer support, redesigning a role,<br/>or your own anonymous scenario"]
        B["2. Think first<br/>Write what you would do before seeing AI"]
        C["3. Explore alternatives<br/>AI generates three options, not a recommendation"]
        D["4. Lock your choice<br/>Pick A, B or C<br/>Did AI surface an option you had not considered?"]
        E["5. Reveal and compare<br/>See your pick beside Decision-1's independent ranking"]
        F["6. Reflect<br/>Would you stay with your choice or change your mind?"]
        A --> B --> C --> D --> E --> F
    end

    subgraph challenge["OPTIONAL PRESSURE TEST | about 5 more minutes"]
        G["7. Challenge one side<br/>Your choice OR the model's top option<br/>Add your goal, constraint and evidence"]
        H["8. Respond to the challenge<br/>Defend, revise or propose a test"]
        I["9. Take away a practical next step<br/>A decision guardrail and an evidence-gathering action"]
        G --> H --> I
    end

    F -. "Go deeper" .-> G
    F -->|"Finish here"| J["Your judgment stays in charge"]
    I --> J

    classDef human fill:#CFE4FA,stroke:#0078D4,color:#000000,stroke-width:2px;
    classDef ai fill:#E8DAEF,stroke:#5C2D91,color:#000000,stroke-width:2px;
    classDef outcome fill:#DFF6DD,stroke:#107C10,color:#000000,stroke-width:2px;
    class A,B,D,F,H human;
    class C,E,G ai;
    class I,J outcome;
    style core fill:transparent,stroke:#0078D4,stroke-width:1px
    style challenge fill:transparent,stroke:#5C2D91,stroke-width:1px,stroke-dasharray:5 5
```

**What to watch for:** Did AI expand your options? Did its ranking influence you? What evidence would justify changing your mind?

**Why this order matters:** You commit before seeing AI-generated options, and choose before seeing the model's ranking. Your selected option is not included in the independent scoring request. A model score is input to your judgment, not a verdict.
