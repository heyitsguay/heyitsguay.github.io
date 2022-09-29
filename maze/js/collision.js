class CollisionPlayer extends Collision {
    constructor(entity2) {
        super(player, entity2);
    }
}

class Collision {
    constructor(entity1, entity2) {
        this.entity1 = entity1;
        this.entity2 = entity2;
    }

    update1() {}

    update2() {}
}