# GL Upgrade Planner

Tracks the cooldowns of the free items in Galaxy Life so a player knows when to collect them again.

## Language

**Drop**:
One of the three free items a player can collect in Galaxy Life (Star Battery, Tool Case, Helmet).
_Avoid_: Item, reward, gift

**Cooldown**:
The fixed duration between collecting a Drop and being able to collect it again.
_Avoid_: Timer duration, delay

**Ready date**:
The instant at which a Drop becomes collectable again.
_Avoid_: Availability date, expiry

**Collect**:
The act of picking up a Drop in the game, which starts its Cooldown.
_Avoid_: Claim, redeem

**Player**:
The person using the app to track their Drops, whether signed in or not.
_Avoid_: User

**Sign in**:
Authenticating with Google to identify the Player as themself.
_Avoid_: Log in, authenticate

**Colony**:
A planet owned by the player, each with its own Star Base. There are twelve fixed Colonies, the main planet and eleven others, which the Observatory unlocks one per level. The main planet is a Colony like any other.
_Avoid_: Planet, base, world

**Star Base**:
The central building of a Colony, whose level caps the level and the count of every other Building on that Colony.
_Avoid_: HQ, town hall

**Building type**:
A kind of structure defined in the catalog (for example Barracks), with its limits per Star Base level. Some Building types exist only on the main planet.
_Avoid_: Class, model

**Building**:
One placed instance of a Building type on a Colony, with its own level. Decorations are not tracked.
_Avoid_: Structure, tile

**Observatory**:
The Building type, only on the main planet, whose level sets how many other Colonies are unlocked.
_Avoid_: Telescope

**Missing**:
Status of a Building type whose owned count is below its maximum count for the Star Base level.

**Below limit**:
Status of a Building whose level is below the maximum level the Star Base allows.
_Avoid_: Outdated

**Over limit**:
Status of a Building or count that exceeds what the Star Base now allows, after the Star Base level was lowered. The data is kept, never deleted.
_Avoid_: Invalid

**Maxed**:
Status of a Building type with nothing left to build or upgrade at the current Star Base level.
_Avoid_: Complete, done

**Next step**:
An action the Planner recommends on a Colony, shown with the time it takes: raising the Star Base by one level, building one Missing Building, raising one Building Below limit by one level, unlocking a Unit type or raising one Unit level by one.
_Avoid_: Suggestion, todo, task

**Planner**:
The area of the app that tracks a Colony's Buildings against what the Star Base allows and recommends what to build or upgrade next.
_Avoid_: Colonies tab, Colony tracker, progression view

**Construction**:
A Next step the Player has started, running until its Finish date. It stays pending until the Player applies it with Done or cancels it.
_Avoid_: Timer, upgrade in progress, job

**Finish date**:
The instant at which a Construction is expected to end in the game.
_Avoid_: Ready date, end time

**Finished**:
Status of a Construction whose Finish date has passed and that the Player has not yet applied.
_Avoid_: Ready, complete

**Laboratory**:
The Building type that raises Unit levels on its own Colony. Its level caps the Unit level of every Unit type on that Colony.
_Avoid_: Lab, research center

**Unit type**:
A kind of troop defined in the catalog (for example Marine), available on a Colony once its Star Base reaches the Unit type's Star Base level and the Colony owns a Building of its unlocking Building type. The Marine is at level 1 as soon as a Training Camp exists, every other Unit type needs an Unlock.
_Avoid_: Troop, soldier

**Unit level**:
The level a Unit type has reached on one Colony. Unit levels are not shared between Colonies.
_Avoid_: Unit upgrade, tech level

**Worker**:
A builder of one Colony. Each Colony has between one and five Workers, set by the Player, and each Construction on that Colony occupies one of them until it is Finished. A Worker freed by a Finished Construction is not counted again as a free Worker in the tab title, where the Finished Construction already counts.
_Avoid_: Builder, slot

**Research**:
A Next step raising a Unit level that the Player has started in the Laboratory, running until its Finish date. It occupies no Worker, and a Colony runs at most one Research at a time.
_Avoid_: Unit Construction, unit timer

**Unlock**:
A Next step taking a Unit type from not unlocked to level 1 in the Laboratory. Once started it runs until its Finish date, occupies no Worker, and a Colony runs at most one Unlock at a time, alongside at most one Research.
_Avoid_: Unit Research, discovery

**Idle Laboratory slot**:
The Research or the Unlock slot of a Laboratory when it holds no job and a Unit step of its kind is left to start. It shows the Colony's yellow dot like a free Worker, and each idle slot counts once in the tab title. A slot holding a Finished job is not idle, the Finished job already counts.
_Avoid_: Free Laboratory, inactive lab
